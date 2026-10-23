-- Baseline do schema: objetos que nunca tiveram migration propria.
-- Gerado a partir do catalogo de producao (pg_catalog) em 2026-10-22.
-- As migrations de 2026-06-20 em diante criam o modulo MF e car_services;
-- este arquivo entra antes delas e cobre o resto do schema public.
-- Idempotente o suficiente para rodar em banco recem-criado (supabase start/db reset).

create extension if not exists "uuid-ossp" with schema extensions;


-- ============ TABELAS ============
create table public.car_maintenance (
  id uuid default gen_random_uuid() not null,
  car_id uuid not null,
  km_milestone integer not null,
  description text not null,
  amount numeric(10,2) default 0,
  service_date date,
  is_required boolean default false,
  completed boolean default false,
  created_at timestamp with time zone default now(),
  status text default 'PENDING'::text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  notes text
);

create table public.car_service_templates (
  id uuid default gen_random_uuid() not null,
  description text not null,
  km_milestone integer not null,
  user_id uuid,
  interval_km integer,
  interval_months integer
);

create table public.car_shares (
  id uuid default gen_random_uuid() not null,
  car_id uuid not null,
  shared_by uuid not null,
  shared_with_email text not null,
  permission text not null,
  status text default 'PENDING'::text not null,
  created_at timestamp with time zone default now()
);

create table public.cars (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  plate text,
  renavam text,
  current_km integer default 0,
  created_at timestamp with time zone default now(),
  is_hidden boolean default false
);

create table public.custom_list_items (
  id uuid default gen_random_uuid() not null,
  list_id uuid not null,
  user_id uuid not null,
  content text not null,
  completed boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  order_index integer default 0
);

create table public.custom_list_shares (
  id uuid default gen_random_uuid() not null,
  list_id uuid not null,
  shared_by uuid not null,
  shared_with_email text not null,
  permission text default 'WRITE'::text,
  status text default 'PENDING'::text,
  created_at timestamp with time zone default now(),
  shared_by_email text
);

create table public.custom_lists (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  icon text,
  description text,
  fields jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table public.email_logs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  recipient text not null,
  subject text not null,
  sent_at timestamp with time zone default now(),
  status text default 'sent'::text
);

create table public.finance_categories (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  type text not null,
  user_id uuid,
  created_at timestamp with time zone default now()
);

create table public.finance_config (
  id uuid default gen_random_uuid() not null,
  key text not null,
  value text,
  user_id uuid,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.finance_responsibles (
  id uuid default uuid_generate_v4() not null,
  name text not null,
  email text,
  user_id uuid,
  created_at timestamp with time zone default now(),
  is_main boolean default false
);

create table public.finances (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  payment_date date not null,
  amount numeric(10,2) not null,
  description text not null,
  status text default 'PENDENTE'::text,
  paid_by text,
  email_sent boolean default false,
  type text,
  category text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  credit_card boolean default false
);

create table public.investment_account_types (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.investment_accounts (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text not null,
  institution text,
  color text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  institution_id uuid,
  account_type_id uuid,
  currency text default 'BRL'::text
);

create table public.investment_institutions (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text not null,
  color text default '#6366f1'::text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.investment_records (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  account_id uuid,
  record_date date not null,
  initial_balance numeric default 0,
  final_balance numeric default 0,
  yield numeric default 0,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.markdown_note_shares (
  id uuid default gen_random_uuid() not null,
  note_id uuid,
  shared_by uuid,
  shared_by_email text not null,
  shared_with_email text not null,
  permission text default 'WRITE'::text not null,
  created_at timestamp with time zone default now() not null
);

create table public.markdown_notebook_shares (
  id uuid default gen_random_uuid() not null,
  notebook_id uuid,
  shared_by uuid,
  shared_by_email text not null,
  shared_with_email text not null,
  permission text default 'WRITE'::text not null,
  created_at timestamp with time zone default now() not null
);

create table public.markdown_notebooks (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text not null,
  created_at timestamp with time zone default now() not null
);

create table public.markdown_notes (
  id uuid default gen_random_uuid() not null,
  notebook_id uuid,
  user_id uuid,
  title text not null,
  content text default ''::text not null,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.music_annotations (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  song_id uuid not null,
  page_index integer default 0 not null,
  data jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.music_chord_variations (
  id uuid default gen_random_uuid() not null,
  chord_id uuid not null,
  variation_index integer default 0 not null,
  frets integer[] not null,
  fingers integer[] not null,
  start_fret integer default 1 not null,
  barre_fret integer,
  barre_start_string integer,
  barre_end_string integer,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.music_chords (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  instrument_id uuid not null,
  chord_name text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.music_genres (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text not null,
  created_at timestamp with time zone default now()
);

create table public.music_instruments (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  strings_count integer default 6 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.music_setlist_songs (
  setlist_id uuid not null,
  song_id uuid not null,
  order_index integer default 0
);

create table public.music_setlists (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  name text not null,
  description text,
  created_at timestamp with time zone default now()
);

create table public.music_songs (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  title text not null,
  artist text,
  type text not null,
  content text,
  storage_type text default 'local'::text not null,
  file_path text,
  transpose_offset integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  genre_id uuid,
  is_favorite boolean default false,
  music_link text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.notification_settings (
  id uuid default gen_random_uuid() not null,
  user_id uuid,
  -- Em produção estas duas colunas têm como default e-mails pessoais reais.
  -- Como o repositório é público, o baseline local não traz esse default
  -- (a linha do seed deixa null e o e-mail só é configurado na tela).
  recipient_email text,
  bcc_email text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  menu_order jsonb default '["finances", "investments", "trips", "cars", "settings"]'::jsonb,
  skip_email_modal boolean default false,
  auto_send_on_paid boolean default false,
  skip_confirmations boolean default false,
  visible_modules jsonb default '["launchpad", "finances", "cars", "investments", "trips", "lists", "music", "settings"]'::jsonb
);

create table public.resource_keys (
  id uuid default gen_random_uuid() not null,
  resource_id uuid not null,
  resource_type text not null,
  user_id uuid not null,
  encrypted_key text not null,
  encryption_method text default 'MASTER_KEY'::text not null,
  created_at timestamp with time zone default now()
);

create table public.trip_categories (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  name text not null,
  color text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.trip_checklist_items (
  id uuid default gen_random_uuid() not null,
  checklist_id uuid,
  task text not null,
  completed boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.trip_checklists (
  id uuid default gen_random_uuid() not null,
  trip_id uuid,
  user_id uuid,
  title text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.trip_expenses (
  id uuid default gen_random_uuid() not null,
  trip_id uuid not null,
  user_id uuid not null,
  category_id uuid,
  amount numeric not null,
  currency text default 'BRL'::text not null,
  date date not null,
  description text,
  paid_by text,
  receipt_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  status text default 'PENDENTE'::text
);

create table public.trip_itinerary (
  id uuid default gen_random_uuid() not null,
  trip_id uuid not null,
  user_id uuid not null,
  day text not null,
  "time" text,
  activity text,
  location text,
  notes text,
  completed boolean default false,
  needs_booking boolean default false,
  is_booked boolean default false,
  coordinates jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  order_index integer default 0
);

create table public.trip_shares (
  id uuid default gen_random_uuid() not null,
  trip_id uuid not null,
  shared_by uuid not null,
  shared_with_email text not null,
  permission text default 'WRITE'::text not null,
  status text default 'PENDING'::text not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table public.trips (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  title text not null,
  cities text[] default '{}'::text[] not null,
  countries text[] default '{}'::text[] not null,
  hotels jsonb default '[]'::jsonb not null,
  transports jsonb default '[]'::jsonb not null,
  daily_limit numeric default 0,
  currencies text[] default '{BRL}'::text[] not null,
  start_date date,
  end_date date,
  receipts jsonb default '[]'::jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  participants text[] default '{}'::text[],
  daily_limits jsonb default '{}'::jsonb,
  tickets jsonb default '[]'::jsonb,
  misc_docs jsonb default '[]'::jsonb
);

create table public.user_keys (
  user_id uuid not null,
  public_key text not null,
  encrypted_private_key text not null,
  created_at timestamp with time zone default now()
);

-- ============ CONSTRAINTS ============
alter table public.car_maintenance add constraint car_maintenance_pkey PRIMARY KEY (id);
alter table public.car_service_templates add constraint car_service_templates_pkey PRIMARY KEY (id);
alter table public.car_shares add constraint car_shares_pkey PRIMARY KEY (id);
alter table public.cars add constraint cars_pkey PRIMARY KEY (id);
alter table public.custom_list_items add constraint custom_list_items_pkey PRIMARY KEY (id);
alter table public.custom_list_shares add constraint custom_list_shares_pkey PRIMARY KEY (id);
alter table public.custom_lists add constraint custom_lists_pkey PRIMARY KEY (id);
alter table public.email_logs add constraint email_logs_pkey PRIMARY KEY (id);
alter table public.finance_categories add constraint finance_categories_pkey PRIMARY KEY (id);
alter table public.finance_config add constraint finance_config_pkey PRIMARY KEY (id);
alter table public.finance_responsibles add constraint finance_responsibles_pkey PRIMARY KEY (id);
alter table public.finances add constraint finances_pkey PRIMARY KEY (id);
alter table public.investment_account_types add constraint investment_account_types_pkey PRIMARY KEY (id);
alter table public.investment_accounts add constraint investment_accounts_pkey PRIMARY KEY (id);
alter table public.investment_institutions add constraint investment_institutions_pkey PRIMARY KEY (id);
alter table public.investment_records add constraint investment_records_pkey PRIMARY KEY (id);
alter table public.markdown_note_shares add constraint markdown_note_shares_pkey PRIMARY KEY (id);
alter table public.markdown_notebook_shares add constraint markdown_notebook_shares_pkey PRIMARY KEY (id);
alter table public.markdown_notebooks add constraint markdown_notebooks_pkey PRIMARY KEY (id);
alter table public.markdown_notes add constraint markdown_notes_pkey PRIMARY KEY (id);
alter table public.music_annotations add constraint music_annotations_pkey PRIMARY KEY (id);
alter table public.music_chord_variations add constraint music_chord_variations_pkey PRIMARY KEY (id);
alter table public.music_chords add constraint music_chords_pkey PRIMARY KEY (id);
alter table public.music_genres add constraint music_genres_pkey PRIMARY KEY (id);
alter table public.music_instruments add constraint music_instruments_pkey PRIMARY KEY (id);
alter table public.music_setlist_songs add constraint music_setlist_songs_pkey PRIMARY KEY (setlist_id, song_id);
alter table public.music_setlists add constraint music_setlists_pkey PRIMARY KEY (id);
alter table public.music_songs add constraint music_songs_pkey PRIMARY KEY (id);
alter table public.notification_settings add constraint notification_settings_pkey PRIMARY KEY (id);
alter table public.resource_keys add constraint resource_keys_pkey PRIMARY KEY (id);
alter table public.trip_categories add constraint trip_categories_pkey PRIMARY KEY (id);
alter table public.trip_checklist_items add constraint trip_checklist_items_pkey PRIMARY KEY (id);
alter table public.trip_checklists add constraint trip_checklists_pkey PRIMARY KEY (id);
alter table public.trip_expenses add constraint trip_expenses_pkey PRIMARY KEY (id);
alter table public.trip_itinerary add constraint trip_itinerary_pkey PRIMARY KEY (id);
alter table public.trip_shares add constraint trip_shares_pkey PRIMARY KEY (id);
alter table public.trips add constraint trips_pkey PRIMARY KEY (id);
alter table public.user_keys add constraint user_keys_pkey PRIMARY KEY (user_id);
alter table public.car_maintenance add constraint car_maintenance_unique_service UNIQUE (car_id, description, km_milestone);
alter table public.car_service_templates add constraint car_service_templates_description_km_milestone_key UNIQUE (description, km_milestone);
alter table public.finance_config add constraint finance_config_key_key UNIQUE (key);
alter table public.investment_accounts add constraint investment_accounts_user_id_name_institution_key UNIQUE (user_id, name, institution);
alter table public.markdown_note_shares add constraint unique_note_share UNIQUE (note_id, shared_with_email);
alter table public.markdown_notebook_shares add constraint unique_notebook_share UNIQUE (notebook_id, shared_with_email);
alter table public.music_chords add constraint music_chords_user_id_instrument_id_chord_name_key UNIQUE (user_id, instrument_id, chord_name);
alter table public.music_genres add constraint music_genres_user_id_name_key UNIQUE (user_id, name);
alter table public.music_instruments add constraint music_instruments_user_id_name_key UNIQUE (user_id, name);
alter table public.notification_settings add constraint notification_settings_user_id_key UNIQUE (user_id);
alter table public.resource_keys add constraint resource_keys_resource_id_user_id_key UNIQUE (resource_id, user_id);
alter table public.car_shares add constraint car_shares_permission_check CHECK ((permission = ANY (ARRAY['READ'::text, 'WRITE'::text])));
alter table public.car_shares add constraint car_shares_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text])));
alter table public.custom_list_shares add constraint custom_list_shares_permission_check CHECK ((permission = ANY (ARRAY['READ'::text, 'WRITE'::text])));
alter table public.custom_list_shares add constraint custom_list_shares_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text])));
alter table public.finance_categories add constraint finance_categories_type_check CHECK ((type = ANY (ARRAY['RECEITA'::text, 'DESPESA'::text])));
alter table public.finances add constraint finances_type_check CHECK ((type = ANY (ARRAY['RECEITA'::text, 'DESPESA'::text])));
alter table public.music_songs add constraint music_songs_storage_type_check CHECK ((storage_type = ANY (ARRAY['local'::text, 'cloud'::text])));
alter table public.music_songs add constraint music_songs_type_check CHECK ((type = ANY (ARRAY['cifra'::text, 'partitura'::text])));
alter table public.trip_shares add constraint trip_shares_permission_check CHECK ((permission = ANY (ARRAY['READ'::text, 'WRITE'::text])));
alter table public.trip_shares add constraint trip_shares_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'ACCEPTED'::text, 'REJECTED'::text])));
alter table public.car_maintenance add constraint car_maintenance_car_id_fkey FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE;
alter table public.car_service_templates add constraint car_service_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.car_shares add constraint car_shares_car_id_fkey FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE;
alter table public.car_shares add constraint car_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id);
alter table public.cars add constraint cars_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.custom_list_items add constraint custom_list_items_list_id_fkey FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE;
alter table public.custom_list_items add constraint custom_list_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.custom_list_shares add constraint custom_list_shares_list_id_fkey FOREIGN KEY (list_id) REFERENCES custom_lists(id) ON DELETE CASCADE;
alter table public.custom_list_shares add constraint custom_list_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id);
alter table public.custom_lists add constraint custom_lists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.email_logs add constraint email_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.finance_categories add constraint finance_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.finance_config add constraint finance_config_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.finance_responsibles add constraint finance_responsibles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.finances add constraint finances_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.investment_account_types add constraint investment_account_types_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.investment_accounts add constraint investment_accounts_account_type_id_fkey FOREIGN KEY (account_type_id) REFERENCES investment_account_types(id);
alter table public.investment_accounts add constraint investment_accounts_institution_id_fkey FOREIGN KEY (institution_id) REFERENCES investment_institutions(id);
alter table public.investment_accounts add constraint investment_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.investment_institutions add constraint investment_institutions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.investment_records add constraint investment_records_account_id_fkey FOREIGN KEY (account_id) REFERENCES investment_accounts(id) ON DELETE CASCADE;
alter table public.investment_records add constraint investment_records_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.markdown_note_shares add constraint markdown_note_shares_note_id_fkey FOREIGN KEY (note_id) REFERENCES markdown_notes(id) ON DELETE CASCADE;
alter table public.markdown_note_shares add constraint markdown_note_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.markdown_notebook_shares add constraint markdown_notebook_shares_notebook_id_fkey FOREIGN KEY (notebook_id) REFERENCES markdown_notebooks(id) ON DELETE CASCADE;
alter table public.markdown_notebook_shares add constraint markdown_notebook_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.markdown_notebooks add constraint markdown_notebooks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.markdown_notes add constraint markdown_notes_notebook_id_fkey FOREIGN KEY (notebook_id) REFERENCES markdown_notebooks(id) ON DELETE CASCADE;
alter table public.markdown_notes add constraint markdown_notes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.music_annotations add constraint music_annotations_song_id_fkey FOREIGN KEY (song_id) REFERENCES music_songs(id) ON DELETE CASCADE;
alter table public.music_annotations add constraint music_annotations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.music_chord_variations add constraint music_chord_variations_chord_id_fkey FOREIGN KEY (chord_id) REFERENCES music_chords(id) ON DELETE CASCADE;
alter table public.music_chords add constraint music_chords_instrument_id_fkey FOREIGN KEY (instrument_id) REFERENCES music_instruments(id) ON DELETE CASCADE;
alter table public.music_chords add constraint music_chords_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.music_genres add constraint music_genres_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.music_instruments add constraint music_instruments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.music_setlist_songs add constraint music_setlist_songs_setlist_id_fkey FOREIGN KEY (setlist_id) REFERENCES music_setlists(id) ON DELETE CASCADE;
alter table public.music_setlist_songs add constraint music_setlist_songs_song_id_fkey FOREIGN KEY (song_id) REFERENCES music_songs(id) ON DELETE CASCADE;
alter table public.music_setlists add constraint music_setlists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.music_songs add constraint music_songs_genre_id_fkey FOREIGN KEY (genre_id) REFERENCES music_genres(id) ON DELETE SET NULL;
alter table public.music_songs add constraint music_songs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.notification_settings add constraint notification_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.resource_keys add constraint resource_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.trip_categories add constraint trip_categories_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.trip_checklist_items add constraint trip_checklist_items_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES trip_checklists(id) ON DELETE CASCADE;
alter table public.trip_checklists add constraint trip_checklists_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public.trip_checklists add constraint trip_checklists_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.trip_expenses add constraint trip_expenses_category_id_fkey FOREIGN KEY (category_id) REFERENCES trip_categories(id) ON DELETE SET NULL;
alter table public.trip_expenses add constraint trip_expenses_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public.trip_expenses add constraint trip_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.trip_itinerary add constraint trip_itinerary_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public.trip_itinerary add constraint trip_itinerary_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id);
alter table public.trip_shares add constraint trip_shares_shared_by_fkey FOREIGN KEY (shared_by) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.trip_shares add constraint trip_shares_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE;
alter table public.trips add constraint trips_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.user_keys add constraint user_keys_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- ============ INDICES ============
CREATE INDEX idx_car_service_templates_user_id ON public.car_service_templates USING btree (user_id);
CREATE INDEX idx_car_shares_car_id_shared_with_email ON public.car_shares USING btree (car_id, shared_with_email);
CREATE INDEX idx_car_shares_shared_by ON public.car_shares USING btree (shared_by);
CREATE INDEX idx_cars_user_id ON public.cars USING btree (user_id);
CREATE INDEX idx_custom_list_items_list_id ON public.custom_list_items USING btree (list_id);
CREATE INDEX idx_custom_list_items_user_id ON public.custom_list_items USING btree (user_id);
CREATE INDEX idx_custom_list_shares_list_id_shared_with_email ON public.custom_list_shares USING btree (list_id, shared_with_email);
CREATE INDEX idx_custom_list_shares_shared_by ON public.custom_list_shares USING btree (shared_by);
CREATE INDEX idx_custom_lists_user_id ON public.custom_lists USING btree (user_id);
CREATE INDEX idx_finance_categories_user_id ON public.finance_categories USING btree (user_id);
CREATE INDEX idx_finance_responsibles_user_id ON public.finance_responsibles USING btree (user_id);
CREATE INDEX idx_finances_user_id_payment_date ON public.finances USING btree (user_id, payment_date);
CREATE INDEX idx_investment_accounts_account_type_id ON public.investment_accounts USING btree (account_type_id);
CREATE INDEX idx_investment_accounts_institution_id ON public.investment_accounts USING btree (institution_id);
CREATE INDEX idx_investment_records_account_id ON public.investment_records USING btree (account_id);
CREATE INDEX idx_investment_records_user_id ON public.investment_records USING btree (user_id);
CREATE INDEX idx_music_chord_variations_chord_id ON public.music_chord_variations USING btree (chord_id);
CREATE INDEX idx_music_chords_instrument_id ON public.music_chords USING btree (instrument_id);
CREATE INDEX idx_music_setlist_songs_song_id ON public.music_setlist_songs USING btree (song_id);
CREATE INDEX idx_music_songs_genre_id ON public.music_songs USING btree (genre_id);
CREATE INDEX idx_music_songs_user_id ON public.music_songs USING btree (user_id);
CREATE INDEX idx_music_songs_user_updated_at ON public.music_songs USING btree (user_id, updated_at);
CREATE INDEX idx_trip_expenses_trip_id ON public.trip_expenses USING btree (trip_id);
CREATE INDEX idx_trip_expenses_user_id ON public.trip_expenses USING btree (user_id);
CREATE INDEX idx_trip_itinerary_trip_id ON public.trip_itinerary USING btree (trip_id);
CREATE INDEX idx_trip_itinerary_user_id ON public.trip_itinerary USING btree (user_id);
CREATE INDEX idx_trip_shares_trip_id_shared_with_email ON public.trip_shares USING btree (trip_id, shared_with_email);
CREATE INDEX idx_trips_user_id ON public.trips USING btree (user_id);

-- ============ RLS ============
alter table public.car_maintenance enable row level security;
alter table public.car_service_templates enable row level security;
alter table public.car_shares enable row level security;
alter table public.cars enable row level security;
alter table public.custom_list_items enable row level security;
alter table public.custom_list_shares enable row level security;
alter table public.custom_lists enable row level security;
alter table public.email_logs enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_config enable row level security;
alter table public.finance_responsibles enable row level security;
alter table public.finances enable row level security;
alter table public.investment_account_types enable row level security;
alter table public.investment_accounts enable row level security;
alter table public.investment_institutions enable row level security;
alter table public.investment_records enable row level security;
alter table public.markdown_note_shares enable row level security;
alter table public.markdown_notebook_shares enable row level security;
alter table public.markdown_notebooks enable row level security;
alter table public.markdown_notes enable row level security;
alter table public.music_annotations enable row level security;
alter table public.music_chord_variations enable row level security;
alter table public.music_chords enable row level security;
alter table public.music_genres enable row level security;
alter table public.music_instruments enable row level security;
alter table public.music_setlist_songs enable row level security;
alter table public.music_setlists enable row level security;
alter table public.music_songs enable row level security;
alter table public.notification_settings enable row level security;
alter table public.resource_keys enable row level security;
alter table public.trip_categories enable row level security;
alter table public.trip_checklist_items enable row level security;
alter table public.trip_checklists enable row level security;
alter table public.trip_expenses enable row level security;
alter table public.trip_itinerary enable row level security;
alter table public.trip_shares enable row level security;
alter table public.trips enable row level security;
alter table public.user_keys enable row level security;

create policy "Access maintenance logs" on public.car_maintenance as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM cars
  WHERE ((cars.id = car_maintenance.car_id) AND ((cars.user_id = auth.uid()) OR (EXISTS ( SELECT 1
           FROM car_shares
          WHERE ((car_shares.car_id = cars.id) AND (car_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (car_shares.status = 'ACCEPTED'::text)))))))));
create policy "Users can delete their own templates" on public.car_service_templates as permissive for delete to authenticated using ((user_id = auth.uid()));
create policy "Users can insert their own templates" on public.car_service_templates as permissive for insert to authenticated with check ((user_id = auth.uid()));
create policy "Users can view global and own templates" on public.car_service_templates as permissive for select to authenticated using ((((user_id IS NULL) AND (auth.uid() IS NOT NULL)) OR (user_id = auth.uid())));
create policy "Owners can manage shares" on public.car_shares as permissive for all to authenticated using ((auth.uid() = shared_by));
create policy "Shared users can accept/reject shares" on public.car_shares as permissive for update to authenticated using ((shared_with_email = (auth.jwt() ->> 'email'::text))) with check ((shared_with_email = (auth.jwt() ->> 'email'::text)));
create policy car_shares_view_invited on public.car_shares as permissive for select to authenticated using ((shared_with_email = (auth.jwt() ->> 'email'::text)));
create policy cars_owner_all on public.cars as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy cars_shared_select on public.cars as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM car_shares
  WHERE ((car_shares.car_id = cars.id) AND (car_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (car_shares.status = ANY (ARRAY['ACCEPTED'::text, 'PENDING'::text]))))));
create policy "Users can delete items in their own or shared lists with WRITE" on public.custom_list_items as permissive for delete to public using (((auth.uid() = user_id) OR (list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.user_id = auth.uid()))) OR (list_id IN ( SELECT custom_list_shares.list_id
   FROM custom_list_shares
  WHERE ((custom_list_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (custom_list_shares.permission = 'WRITE'::text))))));
create policy "Users can insert items in their own or shared lists with WRITE" on public.custom_list_items as permissive for insert to public with check (((auth.uid() = user_id) AND ((list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.user_id = auth.uid()))) OR (list_id IN ( SELECT custom_list_shares.list_id
   FROM custom_list_shares
  WHERE ((custom_list_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (custom_list_shares.permission = 'WRITE'::text)))))));
create policy "Users can update items in their own or shared lists with WRITE" on public.custom_list_items as permissive for update to public using (((auth.uid() = user_id) OR (list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.user_id = auth.uid()))) OR (list_id IN ( SELECT custom_list_shares.list_id
   FROM custom_list_shares
  WHERE ((custom_list_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (custom_list_shares.permission = 'WRITE'::text))))));
create policy "Users can view their own or shared list items" on public.custom_list_items as permissive for select to public using (((auth.uid() = user_id) OR (list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.user_id = auth.uid()))) OR (list_id IN ( SELECT custom_list_shares.list_id
   FROM custom_list_shares
  WHERE (custom_list_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Users can create shares for their own lists" on public.custom_list_shares as permissive for insert to public with check (((auth.uid() = shared_by) AND (list_id IN ( SELECT custom_lists.id
   FROM custom_lists
  WHERE (custom_lists.user_id = auth.uid())))));
create policy "Users can delete their own shares" on public.custom_list_shares as permissive for delete to public using ((auth.uid() = shared_by));
create policy "Users can view shares they created or are shared with them" on public.custom_list_shares as permissive for select to public using (((auth.uid() = shared_by) OR (shared_with_email = (auth.jwt() ->> 'email'::text))));
create policy "Users can delete their own lists" on public.custom_lists as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can insert their own lists" on public.custom_lists as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can update their own or shared lists with WRITE permissio" on public.custom_lists as permissive for update to public using (((auth.uid() = user_id) OR (id IN ( SELECT custom_list_shares.list_id
   FROM custom_list_shares
  WHERE ((custom_list_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (custom_list_shares.permission = 'WRITE'::text))))));
create policy "Users can view their own or shared lists" on public.custom_lists as permissive for select to public using (((auth.uid() = user_id) OR (id IN ( SELECT custom_list_shares.list_id
   FROM custom_list_shares
  WHERE (custom_list_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Usuários podem registrar seus envios de e-mail" on public.email_logs as permissive for insert to authenticated with check ((auth.uid() = user_id));
create policy "Usuários podem ver seus próprios logs de e-mail" on public.email_logs as permissive for select to authenticated using ((auth.uid() = user_id));
create policy "Users can manage their categories" on public.finance_categories as permissive for all to authenticated using ((auth.uid() = user_id));
create policy "Permitir leitura para usuários autenticados" on public.finance_config as permissive for select to authenticated using (true);
create policy "Permitir upsert para usuários autenticados" on public.finance_config as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage their responsibles" on public.finance_responsibles as permissive for all to authenticated using ((auth.uid() = user_id));
create policy "Users can manage their own finances" on public.finances as permissive for all to authenticated using ((auth.uid() = user_id));
create policy "Users can manage their own account types" on public.investment_account_types as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can delete their own investment accounts" on public.investment_accounts as permissive for delete to authenticated using ((auth.uid() = user_id));
create policy "Users can insert their own investment accounts" on public.investment_accounts as permissive for insert to authenticated with check ((auth.uid() = user_id));
create policy "Users can update their own investment accounts" on public.investment_accounts as permissive for update to authenticated using ((auth.uid() = user_id));
create policy "Users can view their own investment accounts" on public.investment_accounts as permissive for select to authenticated using ((auth.uid() = user_id));
create policy "Users can manage their own institutions" on public.investment_institutions as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can delete their own investment records" on public.investment_records as permissive for delete to authenticated using ((auth.uid() = user_id));
create policy "Users can insert their own investment records" on public.investment_records as permissive for insert to authenticated with check ((auth.uid() = user_id));
create policy "Users can update their own investment records" on public.investment_records as permissive for update to authenticated using ((auth.uid() = user_id));
create policy "Users can view their own investment records" on public.investment_records as permissive for select to authenticated using ((auth.uid() = user_id));
create policy "Note owners can create shares" on public.markdown_note_shares as permissive for insert to public with check (((shared_by = auth.uid()) AND (note_id IN ( SELECT markdown_notes.id
   FROM markdown_notes
  WHERE (markdown_notes.user_id = auth.uid())))));
create policy "Note owners or receivers can delete shares" on public.markdown_note_shares as permissive for delete to public using (((shared_by = auth.uid()) OR (shared_with_email = (auth.jwt() ->> 'email'::text))));
create policy "Users can view note shares" on public.markdown_note_shares as permissive for select to public using (((shared_by = auth.uid()) OR (shared_with_email = (auth.jwt() ->> 'email'::text))));
create policy "Notebook owners can create shares" on public.markdown_notebook_shares as permissive for insert to public with check (((shared_by = auth.uid()) AND (notebook_id IN ( SELECT markdown_notebooks.id
   FROM markdown_notebooks
  WHERE (markdown_notebooks.user_id = auth.uid())))));
create policy "Notebook owners or receivers can delete shares" on public.markdown_notebook_shares as permissive for delete to public using (((shared_by = auth.uid()) OR (shared_with_email = (auth.jwt() ->> 'email'::text))));
create policy "Users can view notebook shares" on public.markdown_notebook_shares as permissive for select to public using (((shared_by = auth.uid()) OR (shared_with_email = (auth.jwt() ->> 'email'::text))));
create policy "Users can delete their own notebooks" on public.markdown_notebooks as permissive for delete to public using ((auth.uid() = user_id));
create policy "Users can insert their own notebooks" on public.markdown_notebooks as permissive for insert to public with check ((auth.uid() = user_id));
create policy "Users can update their own or shared notebooks with WRITE" on public.markdown_notebooks as permissive for update to public using (((auth.uid() = user_id) OR (id IN ( SELECT markdown_notebook_shares.notebook_id
   FROM markdown_notebook_shares
  WHERE ((markdown_notebook_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (markdown_notebook_shares.permission = 'WRITE'::text))))));
create policy "Users can view their own or shared notebooks" on public.markdown_notebooks as permissive for select to public using (((auth.uid() = user_id) OR (id IN ( SELECT markdown_notebook_shares.notebook_id
   FROM markdown_notebook_shares
  WHERE (markdown_notebook_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Users can delete notes in their own or shared notebooks with WR" on public.markdown_notes as permissive for delete to public using (((user_id = auth.uid()) OR (notebook_id IN ( SELECT markdown_notebooks.id
   FROM markdown_notebooks
  WHERE (markdown_notebooks.user_id = auth.uid()))) OR (notebook_id IN ( SELECT markdown_notebook_shares.notebook_id
   FROM markdown_notebook_shares
  WHERE ((markdown_notebook_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (markdown_notebook_shares.permission = 'WRITE'::text)))) OR (id IN ( SELECT markdown_note_shares.note_id
   FROM markdown_note_shares
  WHERE ((markdown_note_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (markdown_note_shares.permission = 'WRITE'::text))))));
create policy "Users can insert notes in their own or shared notebooks with WR" on public.markdown_notes as permissive for insert to public with check (((auth.uid() = user_id) AND ((notebook_id IN ( SELECT markdown_notebooks.id
   FROM markdown_notebooks
  WHERE (markdown_notebooks.user_id = auth.uid()))) OR (notebook_id IN ( SELECT markdown_notebook_shares.notebook_id
   FROM markdown_notebook_shares
  WHERE ((markdown_notebook_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (markdown_notebook_shares.permission = 'WRITE'::text)))))));
create policy "Users can update notes in their own or shared notebooks with WR" on public.markdown_notes as permissive for update to public using (((user_id = auth.uid()) OR (notebook_id IN ( SELECT markdown_notebooks.id
   FROM markdown_notebooks
  WHERE (markdown_notebooks.user_id = auth.uid()))) OR (notebook_id IN ( SELECT markdown_notebook_shares.notebook_id
   FROM markdown_notebook_shares
  WHERE ((markdown_notebook_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (markdown_notebook_shares.permission = 'WRITE'::text)))) OR (id IN ( SELECT markdown_note_shares.note_id
   FROM markdown_note_shares
  WHERE ((markdown_note_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (markdown_note_shares.permission = 'WRITE'::text))))));
create policy "Users can view notes in their own or shared notebooks" on public.markdown_notes as permissive for select to public using (((user_id = auth.uid()) OR (notebook_id IN ( SELECT markdown_notebooks.id
   FROM markdown_notebooks
  WHERE (markdown_notebooks.user_id = auth.uid()))) OR (notebook_id IN ( SELECT markdown_notebook_shares.notebook_id
   FROM markdown_notebook_shares
  WHERE (markdown_notebook_shares.shared_with_email = (auth.jwt() ->> 'email'::text)))) OR (id IN ( SELECT markdown_note_shares.note_id
   FROM markdown_note_shares
  WHERE (markdown_note_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Users can manage their own annotations" on public.music_annotations as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage their own chord variations" on public.music_chord_variations as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM music_chords c
  WHERE ((c.id = music_chord_variations.chord_id) AND (c.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM music_chords c
  WHERE ((c.id = music_chord_variations.chord_id) AND (c.user_id = auth.uid())))));
create policy "Users can manage their own chords" on public.music_chords as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage their own genres" on public.music_genres as permissive for all to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage their own instruments" on public.music_instruments as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage songs in their setlists" on public.music_setlist_songs as permissive for all to public using ((EXISTS ( SELECT 1
   FROM music_setlists
  WHERE ((music_setlists.id = music_setlist_songs.setlist_id) AND (music_setlists.user_id = auth.uid()))))) with check ((EXISTS ( SELECT 1
   FROM music_setlists
  WHERE ((music_setlists.id = music_setlist_songs.setlist_id) AND (music_setlists.user_id = auth.uid())))));
create policy "Users can manage their own setlists" on public.music_setlists as permissive for all to public using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage their own songs" on public.music_songs as permissive for all to authenticated using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Users can manage their own settings" on public.notification_settings as permissive for all to authenticated using ((auth.uid() = user_id));
create policy "Users can manage keys they created (as owner of resource)" on public.resource_keys as permissive for all to public using (((auth.uid() = user_id) OR (EXISTS ( SELECT 1
   FROM trips t
  WHERE ((t.id = resource_keys.resource_id) AND (t.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM cars c
  WHERE ((c.id = resource_keys.resource_id) AND (c.user_id = auth.uid()))))));
create policy "Users can view keys shared with them" on public.resource_keys as permissive for select to public using ((auth.uid() = user_id));
create policy "Users can manage their own categories" on public.trip_categories as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can view categories of shared trips" on public.trip_categories as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM (trips
     JOIN trip_shares ON ((trips.id = trip_shares.trip_id)))
  WHERE ((trips.user_id = trip_categories.user_id) AND (trip_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Users can manage items of their checklists" on public.trip_checklist_items as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM trip_checklists
  WHERE ((trip_checklists.id = trip_checklist_items.checklist_id) AND (trip_checklists.user_id = auth.uid())))));
create policy "Users can manage their own trip checklists" on public.trip_checklists as permissive for all to authenticated using ((auth.uid() = user_id));
create policy "Shared users can view trip expenses" on public.trip_expenses as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM trip_shares
  WHERE ((trip_shares.trip_id = trip_expenses.trip_id) AND (trip_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Shared users with WRITE can manage trip expenses" on public.trip_expenses as permissive for all to authenticated using ((EXISTS ( SELECT 1
   FROM trip_shares
  WHERE ((trip_shares.trip_id = trip_expenses.trip_id) AND (trip_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (trip_shares.permission = 'WRITE'::text))))) with check ((EXISTS ( SELECT 1
   FROM trip_shares
  WHERE ((trip_shares.trip_id = trip_expenses.trip_id) AND (trip_shares.shared_with_email = (auth.jwt() ->> 'email'::text)) AND (trip_shares.permission = 'WRITE'::text)))));
create policy "Users can manage their own expenses" on public.trip_expenses as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can manage their own trip itineraries" on public.trip_itinerary as permissive for all to authenticated using ((user_id = auth.uid())) with check ((user_id = auth.uid()));
create policy "Users can view shared trip itineraries" on public.trip_itinerary as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM trip_shares
  WHERE ((trip_shares.trip_id = trip_itinerary.trip_id) AND (trip_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Users can manage their own shares" on public.trip_shares as permissive for all to authenticated using ((shared_by = auth.uid())) with check ((shared_by = auth.uid()));
create policy "Users can view shares shared with them" on public.trip_shares as permissive for select to authenticated using ((auth.email() = shared_with_email));
create policy "Users can manage their own trips" on public.trips as permissive for all to authenticated using ((auth.uid() = user_id)) with check ((auth.uid() = user_id));
create policy "Users can view trips shared with them" on public.trips as permissive for select to authenticated using ((EXISTS ( SELECT 1
   FROM trip_shares
  WHERE ((trip_shares.trip_id = trips.id) AND (trip_shares.shared_with_email = (auth.jwt() ->> 'email'::text))))));
create policy "Users can manage their own keys" on public.user_keys as permissive for all to public using ((auth.uid() = user_id));
create policy "Users can view any public key" on public.user_keys as permissive for select to public using (true);

-- ============ VIEWS ============
create or replace view public.music_artist_counts with (security_invoker=true) as  SELECT artist,
    user_id,
    count(*) AS song_count
   FROM music_songs
  WHERE ((artist IS NOT NULL) AND (artist <> ''::text))
  GROUP BY artist, user_id;;

create or replace view public.music_unique_artists with (security_invoker=true) as  SELECT DISTINCT artist,
    user_id
   FROM music_songs
  WHERE ((artist IS NOT NULL) AND (artist <> ''::text));;

-- ============ FUNCOES ============
CREATE OR REPLACE FUNCTION public.get_artists_by_letter(p_user_id uuid, p_letter text)
 RETURNS TABLE(artist text, song_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF p_letter = '#' THEN
    RETURN QUERY
      SELECT mac.artist, mac.song_count
      FROM music_artist_counts mac
      WHERE mac.user_id = p_user_id
        AND mac.artist !~ '^[[:alpha:]]'
      ORDER BY mac.artist ASC;
  ELSE
    RETURN QUERY
      SELECT mac.artist, mac.song_count
      FROM music_artist_counts mac
      WHERE mac.user_id = p_user_id
        AND mac.artist ILIKE p_letter || '%'
      ORDER BY mac.artist ASC;
  END IF;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_public_key_by_email(p_email text)
 RETURNS TABLE(user_id uuid, public_key text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT uk.user_id, uk.public_key
    FROM public.user_keys uk
    JOIN auth.users u ON u.id = uk.user_id
    WHERE u.email = p_email;
END; $function$;


-- ============ GRANTS ============
grant all privileges on table public.car_maintenance to authenticated;
grant all privileges on table public.car_maintenance to service_role;
grant all privileges on table public.car_service_templates to authenticated;
grant all privileges on table public.car_service_templates to service_role;
grant all privileges on table public.car_shares to authenticated;
grant all privileges on table public.car_shares to service_role;
grant all privileges on table public.cars to authenticated;
grant all privileges on table public.cars to service_role;
grant all privileges on table public.custom_list_items to anon;
grant all privileges on table public.custom_list_items to authenticated;
grant all privileges on table public.custom_list_items to service_role;
grant all privileges on table public.custom_list_shares to anon;
grant all privileges on table public.custom_list_shares to authenticated;
grant all privileges on table public.custom_list_shares to service_role;
grant all privileges on table public.custom_lists to anon;
grant all privileges on table public.custom_lists to authenticated;
grant all privileges on table public.custom_lists to service_role;
grant all privileges on table public.email_logs to anon;
grant all privileges on table public.email_logs to authenticated;
grant all privileges on table public.email_logs to service_role;
grant all privileges on table public.finance_categories to authenticated;
grant all privileges on table public.finance_categories to service_role;
grant all privileges on table public.finance_config to authenticated;
grant all privileges on table public.finance_config to service_role;
grant all privileges on table public.finance_responsibles to authenticated;
grant all privileges on table public.finance_responsibles to service_role;
grant all privileges on table public.finances to authenticated;
grant all privileges on table public.finances to service_role;
grant all privileges on table public.investment_account_types to anon;
grant all privileges on table public.investment_account_types to authenticated;
grant all privileges on table public.investment_account_types to service_role;
grant all privileges on table public.investment_accounts to authenticated;
grant all privileges on table public.investment_accounts to service_role;
grant all privileges on table public.investment_institutions to anon;
grant all privileges on table public.investment_institutions to authenticated;
grant all privileges on table public.investment_institutions to service_role;
grant all privileges on table public.investment_records to authenticated;
grant all privileges on table public.investment_records to service_role;
grant all privileges on table public.markdown_note_shares to anon;
grant all privileges on table public.markdown_note_shares to authenticated;
grant all privileges on table public.markdown_note_shares to service_role;
grant all privileges on table public.markdown_notebook_shares to anon;
grant all privileges on table public.markdown_notebook_shares to authenticated;
grant all privileges on table public.markdown_notebook_shares to service_role;
grant all privileges on table public.markdown_notebooks to anon;
grant all privileges on table public.markdown_notebooks to authenticated;
grant all privileges on table public.markdown_notebooks to service_role;
grant all privileges on table public.markdown_notes to anon;
grant all privileges on table public.markdown_notes to authenticated;
grant all privileges on table public.markdown_notes to service_role;
grant all privileges on table public.music_annotations to anon;
grant all privileges on table public.music_annotations to authenticated;
grant all privileges on table public.music_annotations to service_role;
grant all privileges on table public.music_artist_counts to anon;
grant all privileges on table public.music_artist_counts to authenticated;
grant all privileges on table public.music_artist_counts to service_role;
grant all privileges on table public.music_chord_variations to anon;
grant all privileges on table public.music_chord_variations to authenticated;
grant all privileges on table public.music_chord_variations to service_role;
grant all privileges on table public.music_chords to anon;
grant all privileges on table public.music_chords to authenticated;
grant all privileges on table public.music_chords to service_role;
grant all privileges on table public.music_genres to anon;
grant all privileges on table public.music_genres to authenticated;
grant all privileges on table public.music_genres to service_role;
grant all privileges on table public.music_instruments to anon;
grant all privileges on table public.music_instruments to authenticated;
grant all privileges on table public.music_instruments to service_role;
grant all privileges on table public.music_setlist_songs to anon;
grant all privileges on table public.music_setlist_songs to authenticated;
grant all privileges on table public.music_setlist_songs to service_role;
grant all privileges on table public.music_setlists to anon;
grant all privileges on table public.music_setlists to authenticated;
grant all privileges on table public.music_setlists to service_role;
grant all privileges on table public.music_songs to anon;
grant all privileges on table public.music_songs to authenticated;
grant all privileges on table public.music_songs to service_role;
grant all privileges on table public.music_unique_artists to anon;
grant all privileges on table public.music_unique_artists to authenticated;
grant all privileges on table public.music_unique_artists to service_role;
grant all privileges on table public.notification_settings to authenticated;
grant all privileges on table public.notification_settings to service_role;
grant all privileges on table public.resource_keys to anon;
grant all privileges on table public.resource_keys to authenticated;
grant all privileges on table public.resource_keys to service_role;
grant all privileges on table public.trip_categories to authenticated;
grant all privileges on table public.trip_categories to service_role;
grant all privileges on table public.trip_checklist_items to authenticated;
grant all privileges on table public.trip_checklist_items to service_role;
grant all privileges on table public.trip_checklists to authenticated;
grant all privileges on table public.trip_checklists to service_role;
grant all privileges on table public.trip_expenses to authenticated;
grant all privileges on table public.trip_expenses to service_role;
grant all privileges on table public.trip_itinerary to anon;
grant all privileges on table public.trip_itinerary to authenticated;
grant all privileges on table public.trip_itinerary to service_role;
grant all privileges on table public.trip_shares to authenticated;
grant all privileges on table public.trip_shares to service_role;
grant all privileges on table public.trips to authenticated;
grant all privileges on table public.trips to service_role;
grant all privileges on table public.user_keys to anon;
grant all privileges on table public.user_keys to authenticated;
grant all privileges on table public.user_keys to service_role;

-- ============ ANON REVOKES ============
-- O stack local do Supabase aplica `alter default privileges ... grant all to anon`
-- em toda tabela criada em public, então as tabelas abaixo nascem com acesso para
-- o role anon. Em produção elas não têm esse grant (e o app só acessa autenticado),
-- então revogamos para o schema local ficar idêntico ao de produção.
revoke all on table public.car_maintenance from anon;
revoke all on table public.car_service_templates from anon;
revoke all on table public.car_shares from anon;
revoke all on table public.cars from anon;
revoke all on table public.finance_categories from anon;
revoke all on table public.finance_config from anon;
revoke all on table public.finance_responsibles from anon;
revoke all on table public.finances from anon;
revoke all on table public.investment_accounts from anon;
revoke all on table public.investment_records from anon;
revoke all on table public.notification_settings from anon;
revoke all on table public.trip_categories from anon;
revoke all on table public.trip_checklist_items from anon;
revoke all on table public.trip_checklists from anon;
revoke all on table public.trip_expenses from anon;
revoke all on table public.trip_shares from anon;
revoke all on table public.trips from anon;
