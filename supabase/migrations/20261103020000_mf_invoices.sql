-- Faturas como entidade (primeira etapa da correção).
--
-- Até aqui a fatura era 100% derivada de `mf_transactions` pelo
-- `buildCardInvoices`. Isso deixava o status depender do conjunto de
-- transações carregado por cada tela e fazia espelhos automáticos PAGO
-- passarem por pagamento real. Esta tabela guarda o cabeçalho da fatura
-- (total oficial, total pago e status) e será a fonte da verdade da UI.
--
-- Nesta primeira etapa:
--   - cria `mf_invoices` e faz o backfill dos totais derivados;
--   - NÃO altera nem apaga `mf_transactions`;
--   - cria views de auditoria para separar pagamentos vinculados,
--     espelhos automáticos e transferências legadas.
--
-- `paid_total`/`status` começam zerados/OPEN de propósito: o backfill de
-- pagamentos será feito depois da auditoria dos espelhos automáticos.

create table if not exists public.mf_invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.mf_accounts(id) on delete cascade,
  close_date date not null,
  due_date date,
  total numeric(14, 2) not null default 0,
  total_source text not null default 'derived'
    check (total_source in ('derived', 'manual', 'imported')),
  paid_total numeric(14, 2) not null default 0,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'PAID', 'SCHEDULED', 'OVERDUE')),
  paid_at date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, close_date)
);

create index if not exists mf_invoices_user_card_idx
  on public.mf_invoices (user_id, card_id, close_date desc);

create index if not exists mf_invoices_due_idx
  on public.mf_invoices (user_id, due_date);

alter table public.mf_invoices enable row level security;

drop policy if exists mf_invoices_own on public.mf_invoices;
create policy mf_invoices_own
  on public.mf_invoices
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.mf_invoices from public, anon;
grant select, insert, update, delete on public.mf_invoices to authenticated;

create or replace function public.mf_invoices_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mf_invoices_touch on public.mf_invoices;
create trigger mf_invoices_touch
before update on public.mf_invoices
for each row execute function public.mf_invoices_touch();

/**
 * Vencimento aproximado a partir do fechamento e do `due_day` atual do
 * cartão. O histórico de `mf_card_settings` e os dias úteis continuam
 * sendo aplicados pelo app; aqui o objetivo é ter a data no cabeçalho
 * para a auditoria.
 */
create or replace function public.mf_invoice_due_date(p_card uuid, p_close date)
returns date
language plpgsql
stable
as $$
declare
  v_due int;
  v_year int;
  v_month int;
  v_last date;
begin
  if p_close is null then return null; end if;
  select due_day into v_due from public.mf_accounts where id = p_card;
  if v_due is null then return null; end if;

  v_year := extract(year from p_close)::int;
  v_month := extract(month from p_close)::int;
  if v_due <= extract(day from p_close)::int then
    v_month := v_month + 1;
    if v_month > 12 then
      v_month := 1;
      v_year := v_year + 1;
    end if;
  end if;

  v_last := (make_date(v_year, v_month, 1) + interval '1 month - 1 day')::date;
  return make_date(v_year, v_month, least(v_due, extract(day from v_last)::int));
end;
$$;

-- Backfill dos cabeçalhos: uma fatura por (cartão, invoice_close).
-- `total` é a soma líquida das compras/estornos; não sobrescreve um total
-- manual se a migração rodar novamente.
insert into public.mf_invoices (
  user_id, card_id, close_date, due_date, total, total_source
)
select
  a.user_id,
  t.account_id,
  t.invoice_close::date,
  public.mf_invoice_due_date(t.account_id, t.invoice_close::date),
  coalesce(sum(t.amount), 0),
  'derived'
from public.mf_transactions t
join public.mf_accounts a on a.id = t.account_id
where a.account_type = 'CARTAO'
  and t.type = 'DESPESA'
  and t.status <> 'CANCELADO'
  and t.invoice_close is not null
group by a.user_id, t.account_id, t.invoice_close
on conflict (card_id, close_date) do nothing;

-- Pagamentos vinculados por fatura: DESPESA na conta vinculada com o
-- mesmo `invoice_close` (modelo novo). A view não decide o que é real;
-- ela expõe o marcador e a data de criação para a auditoria.
create or replace view public.mf_invoice_audit_payments
with (security_invoker = true)
as
select
  i.id as invoice_id,
  i.user_id,
  i.card_id,
  a.name as card_name,
  i.close_date,
  p.id as transaction_id,
  p.payment_date,
  p.description,
  p.amount,
  p.status,
  p.notes,
  p.created_at,
  (p.notes = 'Agendado automaticamente (fatura)') as auto_note
from public.mf_invoices i
join public.mf_accounts a on a.id = i.card_id
join public.mf_transactions p
  on p.account_id = a.linked_account_id
 and p.invoice_close = i.close_date
 and p.type = 'DESPESA'
 and p.status <> 'CANCELADO';

-- Transferências legadas para o cartão (sem `invoice_close`): são o pool
-- do FIFO histórico e precisam ser preservadas na auditoria.
create or replace view public.mf_invoice_legacy_transfers
with (security_invoker = true)
as
select
  p.id,
  p.user_id,
  p.transfer_account_id as card_id,
  a.name as card_name,
  p.payment_date,
  p.amount,
  p.status,
  p.description,
  p.created_at
from public.mf_transactions p
join public.mf_accounts a on a.id = p.transfer_account_id
where p.type = 'TRANSFERENCIA'
  and p.transfer_account_id is not null
  and p.invoice_close is null
  and p.status <> 'CANCELADO';

-- Resumo por fatura: total derivado, pagamentos vinculados, quanto tem
-- nota de espelho automático e quantas linhas de pagamento existem.
create or replace view public.mf_invoice_audit
with (security_invoker = true)
as
select
  i.id,
  i.user_id,
  i.card_id,
  a.name as card_name,
  i.close_date,
  i.due_date,
  i.total,
  i.total_source,
  i.status,
  i.paid_total,
  coalesce(sum(case when p.id is not null and p.status = 'PAGO' then p.amount else 0 end), 0) as linked_paid,
  coalesce(sum(case when p.id is not null and p.notes = 'Agendado automaticamente (fatura)' and p.status = 'PAGO' then p.amount else 0 end), 0) as auto_note_paid,
  count(p.id) filter (where p.id is not null) as linked_rows
from public.mf_invoices i
join public.mf_accounts a on a.id = i.card_id
left join public.mf_transactions p
  on p.account_id = a.linked_account_id
 and p.invoice_close = i.close_date
 and p.type = 'DESPESA'
 and p.status <> 'CANCELADO'
group by i.id, a.name;

revoke all on public.mf_invoice_audit from public, anon;
revoke all on public.mf_invoice_audit_payments from public, anon;
revoke all on public.mf_invoice_legacy_transfers from public, anon;
grant select on public.mf_invoice_audit to authenticated;
grant select on public.mf_invoice_audit_payments to authenticated;
grant select on public.mf_invoice_legacy_transfers to authenticated;
