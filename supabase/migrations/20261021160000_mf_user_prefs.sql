-- Preferências de interface do usuário (MF): o painel personalizável do
-- Resumo (ordem dos widgets, widgets/contas/gráficos ocultos) e o critério
-- de ordenação das contas.
--
-- Antes disso tudo vivia no localStorage — ou seja, POR APARELHO: o
-- mesmo usuário via um painel diferente no celular, no tablet e no
-- desktop. Agora o servidor é a fonte da verdade e o localStorage segue
-- como cache instantâneo (e o funcionamento offline).
create table if not exists public.mf_user_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.mf_user_prefs enable row level security;

drop policy if exists "mf_user_prefs_select_own" on public.mf_user_prefs;
create policy "mf_user_prefs_select_own"
  on public.mf_user_prefs for select
  using (auth.uid() = user_id);

drop policy if exists "mf_user_prefs_insert_own" on public.mf_user_prefs;
create policy "mf_user_prefs_insert_own"
  on public.mf_user_prefs for insert
  with check (auth.uid() = user_id);

drop policy if exists "mf_user_prefs_update_own" on public.mf_user_prefs;
create policy "mf_user_prefs_update_own"
  on public.mf_user_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists mf_user_prefs_user_id_idx
  on public.mf_user_prefs (user_id);
