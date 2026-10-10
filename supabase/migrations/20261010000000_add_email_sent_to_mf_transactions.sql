-- Comprovante por e-mail (Minhas Finanças): marca os lançamentos cujo
-- comprovante já foi enviado (o botão ✉️ acende, como no Finance).
alter table public.mf_transactions
  add column if not exists email_sent boolean not null default false;
