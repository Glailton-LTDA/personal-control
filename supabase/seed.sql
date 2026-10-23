-- Seed de desenvolvimento (minimo, nao e dump de producao).
--
-- Cenario coberto: cartao com fatura fechada (paga e em aberto) e fatura
-- corrente aberta, parcela 3/10, gasto fixo mensal, transferencia entre
-- contas, conta em USD, viagem passada e futura, e investimento
-- "Rendimentos / Mercado Pago".
--
-- Login local: dev@local.test / dev123456
-- (rode `npx supabase db reset` para recarregar; os UUIDs sao fixos)

-- ---------------------------------------------------------------------------
-- Usuario de auth
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change
) values (
  '00000000-0000-0000-0000-000000000000',
  '9659a65c-7a82-4b08-a9d4-64fd2346cbb1',
  'authenticated', 'authenticated', 'dev@local.test',
  extensions.crypt('dev123456', extensions.gen_salt('bf')),
  now(), now(), now(), '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  '9659a65c-7a82-4b08-a9d4-64fd2346cbb1',
  '9659a65c-7a82-4b08-a9d4-64fd2346cbb1',
  jsonb_build_object('sub', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'email', 'dev@local.test'),
  'email', now(), now(), now()
) on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Minhas Financas: cadastros
-- ---------------------------------------------------------------------------
insert into public.mf_responsibles (id, user_id, name, email, color, is_main)
values ('b0000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Dev Local', 'dev@local.test', '#6366f1', true)
on conflict (id) do nothing;

insert into public.mf_account_groups (id, user_id, name, icon, color, sort_order)
values ('a9000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Dia a dia', '🏦', '#3b82f6', 1)
on conflict (id) do nothing;

insert into public.mf_accounts (id, user_id, name, account_type, initial_balance, color, icon, closing_day, due_day, credit_limit, sort_order, currency, card_brand, group_id, linked_account_id)
values
  ('a0000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Conta Corrente', 'CORRENTE', 5000, '#3b82f6', '🏦', null, null, null, 1, 'BRL', null, 'a9000000-0000-4000-8000-000000000001', null),
  ('a0000000-0000-4000-8000-000000000002', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Nubank', 'CARTAO', 0, '#8b5cf6', '💳', 3, 10, 5000, 2, 'BRL', 'Mastercard', 'a9000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000003', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Poupança', 'POUPANCA', 12000, '#10b981', '🐷', null, null, null, 3, 'BRL', null, null, null),
  ('a0000000-0000-4000-8000-000000000004', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Carteira USD', 'CORRENTE', 800, '#f59e0b', '💵', null, null, null, 4, 'USD', null, null, null)
on conflict (id) do nothing;

insert into public.mf_categories (id, user_id, name, type, parent_id, color, icon, sort_order)
values
  ('c0000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Moradia', 'DESPESA', null, '#6366f1', '🏠', 1),
  ('c0000000-0000-4000-8000-000000000002', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Alimentação', 'DESPESA', null, '#f97316', '🍽️', 2),
  ('c0000000-0000-4000-8000-000000000003', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Transporte', 'DESPESA', null, '#64748b', '🚗', 3),
  ('c0000000-0000-4000-8000-000000000004', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Saúde', 'DESPESA', null, '#ef4444', '💊', 4),
  ('c0000000-0000-4000-8000-000000000005', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Lazer', 'DESPESA', null, '#a855f7', '🎬', 5),
  ('c0000000-0000-4000-8000-000000000006', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Salário', 'RECEITA', null, '#10b981', '💰', 6),
  ('c0000000-0000-4000-8000-000000000007', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Mercado', 'DESPESA', 'c0000000-0000-4000-8000-000000000002', '#fb923c', '🛒', 1)
on conflict (id) do nothing;

insert into public.mf_tags (id, user_id, name, color)
values ('c1000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'reembolsável', '#0ea5e9')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Minhas Financas: lancamentos
-- ---------------------------------------------------------------------------
-- Cartao: ciclo que fecha em 03/09 (fechada, em aberto), 03/10 (fechada e paga)
-- e 03/11 (corrente/aberta).
insert into public.mf_transactions (id, user_id, account_id, type, description, amount, payment_date, status, category_id, responsible_id, installments_current, installments_total, invoice_close)
values
  ('e0000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000002', 'DESPESA', 'Posto Shell', 210.00, '2026-08-25', 'PENDENTE', 'c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', null, null, '2026-09-03'),
  ('e0000000-0000-4000-8000-000000000002', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000002', 'DESPESA', 'Supermercado Extra', 320.00, '2026-09-20', 'PAGO', 'c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000001', null, null, '2026-10-03'),
  ('e0000000-0000-4000-8000-000000000003', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000002', 'DESPESA', 'Farmácia', 89.90, '2026-09-28', 'PAGO', 'c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', null, null, '2026-10-03'),
  ('e0000000-0000-4000-8000-000000000004', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000002', 'DESPESA', 'Restaurante', 145.50, '2026-10-15', 'PAGO', 'c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', null, null, '2026-11-03'),
  ('e0000000-0000-4000-8000-000000000005', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000002', 'DESPESA', 'Notebook', 250.00, '2026-10-10', 'PAGO', 'c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001', 3, 10, '2026-11-03')
on conflict (id) do nothing;

-- Pagamento da fatura que fechou em 03/10 (sai da conta vinculada ao cartao).
insert into public.mf_transactions (id, user_id, account_id, type, description, amount, payment_date, status, category_id, responsible_id, invoice_close)
values
  ('e0000000-0000-4000-8000-000000000010', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000001', 'DESPESA', 'Pagamento fatura Nubank', 409.90, '2026-10-10', 'PAGO', null, 'b0000000-0000-4000-8000-000000000001', '2026-10-03')
on conflict (id) do nothing;

-- Conta corrente: receita, fixos e transferencia.
insert into public.mf_transactions (id, user_id, account_id, type, description, amount, payment_date, status, category_id, responsible_id, is_fixed, recurrence)
values
  ('e0000000-0000-4000-8000-000000000020', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000001', 'RECEITA', 'Salário', 9000.00, '2026-10-05', 'PAGO', 'c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', false, 'NONE'),
  ('e0000000-0000-4000-8000-000000000021', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000001', 'DESPESA', 'Aluguel', 1800.00, '2026-10-05', 'PENDENTE', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', true, 'MONTHLY'),
  ('e0000000-0000-4000-8000-000000000022', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000001', 'DESPESA', 'Internet', 120.00, '2026-10-12', 'PAGO', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', true, 'MONTHLY')
on conflict (id) do nothing;

insert into public.mf_transactions (id, user_id, account_id, transfer_account_id, type, description, amount, payment_date, status)
values
  ('e0000000-0000-4000-8000-000000000030', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'TRANSFERENCIA', 'Reserva do mês', 500.00, '2026-10-02', 'PAGO')
on conflict (id) do nothing;

-- Conta em USD.
insert into public.mf_transactions (id, user_id, account_id, type, description, amount, payment_date, status, category_id)
values
  ('e0000000-0000-4000-8000-000000000040', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'a0000000-0000-4000-8000-000000000004', 'DESPESA', 'Café da manhã', 12.50, '2026-10-12', 'PAGO', 'c0000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.mf_transaction_tags (transaction_id, tag_id, user_id)
values ('e0000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Investimentos (Rendimentos / Mercado Pago)
-- ---------------------------------------------------------------------------
insert into public.investment_institutions (id, user_id, name, color)
values ('f0000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Mercado Pago', '#009ee3')
on conflict (id) do nothing;

insert into public.investment_accounts (id, user_id, name, institution, color, institution_id, currency)
values ('f0000000-0000-4000-8000-000000000002', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Rendimentos', 'Mercado Pago', '#009ee3', 'f0000000-0000-4000-8000-000000000001', 'BRL')
on conflict (id) do nothing;

insert into public.investment_records (id, user_id, account_id, record_date, initial_balance, final_balance, yield)
values
  ('f0000000-0000-4000-8000-000000000010', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'f0000000-0000-4000-8000-000000000002', '2026-09-30', 5000.00, 5120.00, 120.00),
  ('f0000000-0000-4000-8000-000000000011', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'f0000000-0000-4000-8000-000000000002', '2026-10-21', 5120.00, 5240.50, 120.50)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Viagens (uma passada, uma futura)
-- ---------------------------------------------------------------------------
insert into public.trips (id, user_id, title, cities, countries, currencies, start_date, end_date, daily_limit)
values
  ('d0000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Gramado 2026', '{Gramado}', '{Brasil}', '{BRL}', '2026-05-01', '2026-05-05', 400),
  ('d0000000-0000-4000-8000-000000000002', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Lisboa 2026', '{Lisboa}', '{Portugal}', '{BRL,EUR}', '2026-12-20', '2027-01-03', 250)
on conflict (id) do nothing;

insert into public.trip_categories (id, user_id, name, color)
values ('d1000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Hospedagem', '#0ea5e9')
on conflict (id) do nothing;

insert into public.trip_expenses (id, trip_id, user_id, category_id, amount, currency, date, description, status)
values
  ('d2000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'd1000000-0000-4000-8000-000000000001', 2400.00, 'BRL', '2026-05-01', 'Hotel Gramado', 'PAGO'),
  ('d2000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-000000000002', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', null, 3200.00, 'BRL', '2026-10-20', 'Passagens Lisboa', 'PENDENTE')
on conflict (id) do nothing;

insert into public.trip_itinerary (id, trip_id, user_id, day, "time", activity, location)
values ('d3000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', '2026-12-21', '10:00', 'Belém', 'Lisboa')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Carros
-- ---------------------------------------------------------------------------
insert into public.cars (id, user_id, name, plate, current_km)
values ('d4000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', 'Onix', 'ABC1D23', 32000)
on conflict (id) do nothing;

insert into public.car_maintenance (id, car_id, km_milestone, description, amount, service_date, completed, status)
values ('d5000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000001', 30000, 'Troca de óleo', 350.00, '2026-09-15', true, 'DONE')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Preferencias
-- ---------------------------------------------------------------------------
insert into public.notification_settings (id, user_id)
values ('d6000000-0000-4000-8000-000000000001', '9659a65c-7a82-4b08-a9d4-64fd2346cbb1')
on conflict (id) do nothing;
