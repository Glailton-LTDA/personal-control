-- Vigência por mês da configuração do cartão.
--
-- `mf_accounts` guarda a configuração ATUAL (fechamento, vencimento,
-- limite, conta vinculada). Esta tabela guarda o histórico: o cálculo da
-- fatura usa a linha vigente no mês do ciclo, então mudar a configuração
-- não reescreve faturas de meses passados.
create table if not exists public.mf_card_settings (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.mf_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from text not null,
  closing_day integer,
  due_day integer,
  closing_dynamic boolean not null default false,
  due_business_days boolean not null default false,
  credit_limit numeric(14, 2),
  linked_account_id uuid references public.mf_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (card_id, effective_from),
  constraint mf_card_settings_effective_from_fmt
    check (effective_from ~ '^[0-9]{4}-[0-9]{2}$')
);

create index if not exists mf_card_settings_card_month_idx
  on public.mf_card_settings (card_id, effective_from desc);

alter table public.mf_card_settings enable row level security;

drop policy if exists mf_card_settings_select_own on public.mf_card_settings;
create policy mf_card_settings_select_own
  on public.mf_card_settings
  for select
  using (auth.uid() = user_id);

-- Só leitura pelo cliente; quem escreve é o trigger abaixo (security
-- definer). A service role da function de lembretes também lê.
revoke all on public.mf_card_settings from public, anon, authenticated;
grant select on public.mf_card_settings to authenticated;

-- Semente: cartões existentes mantêm a configuração atual válida desde
-- 2000-01 (todo o histórico). Nenhuma fatura passada muda.
insert into public.mf_card_settings (
  card_id, user_id, effective_from, closing_day, due_day,
  closing_dynamic, due_business_days, credit_limit, linked_account_id
)
select
  a.id, a.user_id, '2000-01', a.closing_day, a.due_day,
  coalesce(a.closing_dynamic, false), coalesce(a.due_business_days, false),
  a.credit_limit, a.linked_account_id
from public.mf_accounts a
where a.account_type = 'CARTAO'
on conflict (card_id, effective_from) do nothing;

/**
 * Captura mudanças relevantes do cartão e grava a configuração do mês
 * corrente (America/Sao_Paulo). Várias edições no mesmo mês atualizam a
 * mesma linha — o mês guarda a última configuração.
 */
create or replace function public.mf_card_settings_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(
    (current_timestamp at time zone 'America/Sao_Paulo')::date,
    'YYYY-MM'
  );
begin
  if new.account_type is distinct from 'CARTAO' then
    return new;
  end if;

  if tg_op = 'UPDATE' and not (
    new.closing_day is distinct from old.closing_day or
    new.due_day is distinct from old.due_day or
    new.closing_dynamic is distinct from old.closing_dynamic or
    new.due_business_days is distinct from old.due_business_days or
    new.credit_limit is distinct from old.credit_limit or
    new.linked_account_id is distinct from old.linked_account_id
  ) then
    return new;
  end if;

  insert into public.mf_card_settings (
    card_id, user_id, effective_from, closing_day, due_day,
    closing_dynamic, due_business_days, credit_limit, linked_account_id
  ) values (
    new.id, new.user_id, v_month, new.closing_day, new.due_day,
    coalesce(new.closing_dynamic, false), coalesce(new.due_business_days, false),
    new.credit_limit, new.linked_account_id
  )
  on conflict (card_id, effective_from) do update set
    closing_day = excluded.closing_day,
    due_day = excluded.due_day,
    closing_dynamic = excluded.closing_dynamic,
    due_business_days = excluded.due_business_days,
    credit_limit = excluded.credit_limit,
    linked_account_id = excluded.linked_account_id,
    created_at = now();

  return new;
end;
$$;

drop trigger if exists mf_card_settings_capture on public.mf_accounts;
create trigger mf_card_settings_capture
after insert or update of
  closing_day, due_day, closing_dynamic, due_business_days, credit_limit, linked_account_id
on public.mf_accounts
for each row execute function public.mf_card_settings_capture();
