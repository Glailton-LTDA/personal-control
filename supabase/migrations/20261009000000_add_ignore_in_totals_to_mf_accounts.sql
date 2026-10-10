-- Ignorar nos totais (Minhas Finanças): a conta continua listada, mas o
-- saldo dela fica fora de toda soma agregada (KPIs, rodapé da tabela,
-- totais de grupo/drill). Espelha a opção "Ignorar nos totais" do app
-- original. Aplicada remotamente em 09/10/2026.
alter table public.mf_accounts
  add column if not exists ignore_in_totals boolean not null default false;
