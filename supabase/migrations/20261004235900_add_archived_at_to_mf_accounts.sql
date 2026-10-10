-- Arquivamento de contas e cartões: a conta some das listas de seleção e
-- dos resumos sem apagar o histórico de lançamentos (NULL = ativa).
alter table public.mf_accounts
  add column if not exists archived_at timestamptz;

comment on column public.mf_accounts.archived_at is
  'NULL = ativa; quando preenchida a conta está arquivada (oculta das listas, histórico preservado).';
