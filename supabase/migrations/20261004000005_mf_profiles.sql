-- -------------------------------------------------------------
-- Fase 9 (2026-10-04): perfis separados (pessoal/empresa/família)
-- mf_profiles guarda os contextos do usuário; mf_accounts ganha
-- profile_id (aditiva, ON DELETE SET NULL — conta órfã vira "sem
-- perfil"). Escopo: "Todos os perfis" (sem filtro) ou um perfil
-- (contas do perfil + dados derivados via conta).
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mf_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_own" ON public.mf_profiles;
CREATE POLICY "profiles_own" ON public.mf_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mf_profiles_user
  ON public.mf_profiles (user_id, sort_order);

ALTER TABLE public.mf_accounts
  ADD COLUMN IF NOT EXISTS profile_id UUID
  REFERENCES public.mf_profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mf_accounts_profile
  ON public.mf_accounts (user_id, profile_id);
