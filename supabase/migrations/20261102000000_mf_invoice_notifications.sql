-- Dedup dos avisos de fatura fechada (push). O cron roda 1x/dia; a linha
-- única por (usuário, cartão, fechamento) garante que um re-run manual ou
-- uma retentativa não disparem o mesmo aviso de novo.
create table if not exists public.mf_invoice_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.mf_accounts(id) on delete cascade,
  close_iso date not null,
  sent_at timestamptz not null default now(),
  unique (user_id, card_id, close_iso)
);

create index if not exists mf_invoice_notifications_user_sent_idx
  on public.mf_invoice_notifications (user_id, sent_at desc);

alter table public.mf_invoice_notifications enable row level security;

drop policy if exists mf_invoice_notifications_select_own
  on public.mf_invoice_notifications;
create policy mf_invoice_notifications_select_own
  on public.mf_invoice_notifications
  for select
  using (auth.uid() = user_id);

-- O cliente não escreve: quem insere é a function `mf-reminders` com a
-- service role (que ignora RLS). Sem policy de insert/update/delete.
