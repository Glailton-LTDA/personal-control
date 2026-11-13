-- Aporte vindo de um lançamento (receita) escolhido pelo usuário.
-- Sem backfill: contribuições existentes continuam manuais (transaction_id NULL).
set lock_timeout = '5s';
set statement_timeout = '60s';

alter table public.mf_goal_contributions
  add column if not exists transaction_id uuid;

-- Fila offline: o sincronizador envia `updated_at` em todo upsert. A tabela
-- nasceu sem a coluna; sem ela o aporte criado offline falharia ao subir.
-- Fica anulável para snapshots antigos (sem a chave) ainda restaurarem.
alter table public.mf_goal_contributions
  add column if not exists updated_at timestamptz
  default timezone('utc'::text, now());

drop trigger if exists trg_mf_goal_contributions_updated_at
  on public.mf_goal_contributions;
create trigger trg_mf_goal_contributions_updated_at
before update on public.mf_goal_contributions
for each row execute function public.mf_set_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'mf_goal_contributions'
      and c.conname = 'mf_goal_contributions_transaction_id_fkey'
  ) then
    alter table public.mf_goal_contributions
      add constraint mf_goal_contributions_transaction_id_fkey
      foreign key (transaction_id) references public.mf_transactions(id)
      on delete cascade;
  end if;
end;
$$;

-- Um lançamento gera no máximo um aporte. O índice parcial também acelera
-- a busca do vínculo na edição do lançamento.
create unique index if not exists uq_mf_goal_contributions_transaction
  on public.mf_goal_contributions(transaction_id)
  where transaction_id is not null;

comment on column public.mf_goal_contributions.transaction_id is
  'Lançamento (receita) que originou o aporte; exclusivo por lançamento e removido em cascata com ele.';
