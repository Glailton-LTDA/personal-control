-- Colunas que foram criadas direto no painel do Supabase (sem migration) e que
-- hoje são usadas por mf_card_cycle_totals e pela UI de cartão. Recriadas aqui
-- para que a cadeia de migrations aplique do zero em qualquer banco novo.
alter table public.mf_accounts
  add column if not exists linked_account_id uuid references public.mf_accounts(id) on delete set null;

alter table public.mf_accounts
  add column if not exists card_brand text;
