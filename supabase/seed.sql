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

-- ---------------------------------------------------------------------------
-- Musicas: generos padrao
-- ---------------------------------------------------------------------------
-- Mesmos UUIDs (e dono) da producao: sem isso, uma musica criada no ambiente
-- local com um genero vindo do cache do navegador viola
-- music_songs_genre_id_fkey, e a policy `auth.uid() = user_id` esconde os
-- generos do app.
insert into public.music_genres (id, user_id, name)
select id::uuid, '9659a65c-7a82-4b08-a9d4-64fd2346cbb1', name
from (values
  ('ff09aee7-7683-4f3c-8364-7bbdbe6831d5', 'Axé'),
  ('7d3cca1a-0560-4d8e-9064-c881bbda574f', 'Balada'),
  ('dd5d5cab-a93c-42ad-b7c5-4a9c29a0ca14', 'Blues'),
  ('1a574313-2c9b-4939-802d-9403be66ebb6', 'Bolero'),
  ('be95fd45-ee4c-4dbb-be18-aa42e90a56cd', 'Bossa Nova'),
  ('1b17ee6f-388c-4b01-973f-3195555ee90a', 'Brega'),
  ('d04d445d-6a41-475e-8de9-d218879ef20f', 'Chorinho'),
  ('7937ddcd-fea0-40df-83eb-a74de2c43ffb', 'Country'),
  ('30d1559c-ab62-460f-85fe-887964ae628a', 'Emo'),
  ('78cefa83-0b4b-4a60-846e-7b775130ae23', 'Folcrore'),
  ('233b843e-a853-4969-a589-45fdfc0e0d90', 'Folk'),
  ('22af4b37-bb03-44cd-8ff2-94bef3ea1e86', 'Forró'),
  ('2f3c0bf0-95be-4ca7-8426-a536616ac361', 'Frevo'),
  ('26c4f068-16f4-4ccc-ad7f-dea5ccb68169', 'Funk'),
  ('80de5587-556f-4aab-9779-b0bcbc7f15d7', 'Hip Hop'),
  ('2dacdfc0-28e4-48ce-9425-c80a89b766a5', 'Infantil'),
  ('2dc04353-075d-49cf-892a-b22f4171e5da', 'Jazz'),
  ('cfecd5ab-0b53-4831-af92-77e6e8d92195', 'K-Pop'),
  ('ddea46ae-6258-42e9-ba78-f4496cb38fa3', 'Latina'),
  ('b44587c2-fe0e-4620-8ded-225e9dbdff26', 'Marcha'),
  ('181f3bf3-2016-41df-aa92-5eb4fca12088', 'Metal'),
  ('58800e99-34fc-47da-a571-e262b4495526', 'MPB'),
  ('873ab9cb-9d30-4f7e-b1b2-1eafa81f254d', 'Música Clássica'),
  ('8f27275a-f7cf-4aaa-b7b6-b0e82d35d385', 'Música Folclórica'),
  ('1b121a2c-b3ca-4caa-8020-b609214b13b6', 'Musical'),
  ('3bbf05ce-9247-4ac3-a39f-96a5d3444069', 'Pop'),
  ('75f760ca-1a99-4bd1-9012-7d52f21c8e7f', 'Pop Rock'),
  ('803b7c27-60be-428b-add9-6b2089b0d5af', 'Punk'),
  ('d5c63f11-9010-4057-baaa-d0dc12f30eb9', 'Reggae'),
  ('91231a89-9544-4457-a9df-213d77df72a8', 'Religiosa'),
  ('7761bce2-d151-4a0a-b16d-52ca5b4fcd64', 'Rock'),
  ('f9853d58-a8c8-43ce-af9a-ca38b9f31a44', 'Rumba'),
  ('3842240b-d557-482d-9a28-647158c6174f', 'Samba / Pagode'),
  ('89985a02-716b-47b6-b9b8-99ab7429b77f', 'Samba-canção'),
  ('74433cb6-21e7-44fc-8e9d-cc9c3e739fab', 'Sertanejo'),
  ('66872580-c712-4eae-877a-1fd10eccab67', 'Tango')
) as generos(id, name)
on conflict (id) do nothing;
