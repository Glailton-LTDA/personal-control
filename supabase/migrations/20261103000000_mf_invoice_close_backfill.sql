-- Invariante: toda despesa/estorno de cartão tem fatura (`invoice_close`).
--
-- 1) Fecha o histórico: parcelas sem vínculo herdam a fatura da série
--    (uma por parcela); compras avulsas e estornos usam o fechamento da
--    data. Cartões legados sem `closing_day` (Inter/Ourocard) usam o
--    vencimento como data-base (fecha no fim do mês anterior).
-- 2) Passa a bloquear novas despesas de cartão sem fatura.
--
-- O cálculo da fatura/extrato lê só o `invoice_close`; com o histórico
-- fechado, despesas − estornos = total da fatura.

create or replace function public.mf_close_for_date(p_card uuid, p_date date)
returns date
language plpgsql
stable
as $$
declare
  v_closing int;
  v_last date;
  v_raw date;
  v_next date;
begin
  select closing_day into v_closing from public.mf_accounts where id = p_card;
  if not found then return null; end if;
  if p_date is null then return null; end if;

  -- Cartão legado sem fechamento configurado: a data importada é o
  -- vencimento; a fatura fecha no último dia do mês anterior.
  if v_closing is null then
    return (date_trunc('month', p_date) - interval '1 day')::date;
  end if;

  v_last := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;
  v_raw := make_date(
    extract(year from p_date)::int,
    extract(month from p_date)::int,
    least(v_closing, extract(day from v_last)::int)
  );
  if v_raw < p_date then
    v_next := (date_trunc('month', p_date) + interval '1 month')::date;
    v_last := (date_trunc('month', p_date) + interval '2 months - 1 day')::date;
    v_raw := make_date(
      extract(year from v_next)::int,
      extract(month from v_next)::int,
      least(v_closing, extract(day from v_last)::int)
    );
  end if;
  return v_raw;
end;
$$;

create or replace function public.mf_add_close_months(p_close date, p_months int)
returns date
language sql
immutable
as $$
  select make_date(
    extract(year from (date_trunc('month', p_close) + p_months * interval '1 month'))::int,
    extract(month from (date_trunc('month', p_close) + p_months * interval '1 month'))::int,
    least(
      extract(day from p_close)::int,
      extract(day from (date_trunc('month', p_close) + (p_months + 1) * interval '1 month' - interval '1 day'))::int
    )
  )
$$;

drop table if exists public.mf_backfill_plan;
create table public.mf_backfill_plan as
with base as (
  select t.id, t.account_id, t.description, t.amount, t.payment_date, t.invoice_close,
         t.installments_current, t.installments_total, t.parent_transaction_id,
         exists (
           select 1 from public.mf_transactions c where c.parent_transaction_id = t.id
         ) as has_children
  from public.mf_transactions t
  join public.mf_accounts a on a.id = t.account_id
  where a.account_type = 'CARTAO'
    and t.type = 'DESPESA'
    and t.status <> 'CANCELADO'
),
ranked as (
  select b.*,
    lag(b.payment_date) over (
      partition by b.account_id, b.description, b.installments_total
      order by coalesce(b.installments_current, 999999), b.payment_date, b.id
    ) as prev_date
  from base b
),
grouped as (
  select r.*,
    case
      when r.amount < 0 then null
      when r.parent_transaction_id is not null then r.parent_transaction_id::text
      when r.has_children then r.id::text
      when r.installments_total > 1 then
        r.account_id::text || '|' || r.description || '|' || r.installments_total::text || '|' ||
        sum(
          case
            when coalesce(r.installments_current, 1) = 1
              or r.prev_date is null
              or r.payment_date - r.prev_date > 60
            then 1 else 0
          end
        ) over (
          partition by r.account_id, r.description, r.installments_total
          order by coalesce(r.installments_current, 999999), r.payment_date, r.id
        )::text
      else null
    end as series_key
  from ranked r
),
numbered as (
  select g.*,
    row_number() over (
      partition by series_key
      order by coalesce(installments_current, 999999), payment_date, id
    ) as rn
  from grouped g
),
anchors as (
  select series_key,
    min(rn) filter (where invoice_close is not null) as anchor_rn,
    (array_agg(invoice_close order by rn) filter (where invoice_close is not null))[1] as anchor_close,
    min(rn) as first_rn,
    (array_agg(payment_date order by rn))[1] as first_date,
    (array_agg(account_id order by rn))[1] as account_id
  from numbered
  where series_key is not null
  group by series_key
),
plan as (
  select n.id,
    case
      when n.series_key is null or n.amount < 0
        then public.mf_close_for_date(n.account_id, n.payment_date)
      else public.mf_add_close_months(
        coalesce(
          an.anchor_close,
          public.mf_close_for_date(an.account_id, an.first_date)
        ),
        (n.rn - coalesce(an.anchor_rn, an.first_rn))::int
      )
    end as proposed_close
  from numbered n
  left join anchors an on an.series_key = n.series_key
  where n.invoice_close is null
)
select * from plan;

update public.mf_transactions t
set invoice_close = p.proposed_close
from public.mf_backfill_plan p
where t.id = p.id
  and t.invoice_close is null;

-- Cartões legados sem fechamento/vencimento configurados: a base é o
-- vencimento (15/28), então o fechamento é o fim do mês anterior. Sem
-- isso, os `invoice_close` acima não casariam com `cardCycles`.
update public.mf_accounts
set closing_day = 31, due_day = 15
where id = '0f5a104f-0890-8062-b53c-70c2613e67d9'
  and closing_day is null;

update public.mf_accounts
set closing_day = 31, due_day = 28
where id = 'caae69c8-252a-c7fc-9e1a-a8321ca6069e'
  and closing_day is null;

update public.mf_card_settings
set closing_day = 31, due_day = 15
where card_id = '0f5a104f-0890-8062-b53c-70c2613e67d9';

update public.mf_card_settings
set closing_day = 31, due_day = 28
where card_id = 'caae69c8-252a-c7fc-9e1a-a8321ca6069e';

-- Garante que o backfill fechou tudo o que é despesa de cartão ativa.
do $$
declare
  v_missing int;
begin
  select count(*) into v_missing
  from public.mf_transactions t
  join public.mf_accounts a on a.id = t.account_id
  where a.account_type = 'CARTAO'
    and t.type = 'DESPESA'
    and t.status <> 'CANCELADO'
    and t.invoice_close is null;

  if v_missing > 0 then
    raise exception 'Ainda existem % despesas de cartão sem invoice_close', v_missing;
  end if;
end;
$$;

-- Invariante daqui para frente: despesa de cartão (inclui estorno, que é
-- DESPESA com valor negativo) precisa estar vinculada a uma fatura.
create or replace function public.mf_require_card_invoice_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_type text;
begin
  select account_type into v_account_type
  from public.mf_accounts
  where id = new.account_id;

  if v_account_type = 'CARTAO'
    and new.type = 'DESPESA'
    and new.status is distinct from 'CANCELADO'
    and new.invoice_close is null
  then
    raise exception 'Despesa de cartão exige invoice_close (fatura vinculada)';
  end if;

  return new;
end;
$$;

drop trigger if exists mf_require_card_invoice_close on public.mf_transactions;
create trigger mf_require_card_invoice_close
before insert or update of account_id, type, status, invoice_close
on public.mf_transactions
for each row execute function public.mf_require_card_invoice_close();

drop table if exists public.mf_backfill_plan;
