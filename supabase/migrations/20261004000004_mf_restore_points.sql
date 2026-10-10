-- -------------------------------------------------------------
-- Fase 9 (2026-10-04): pontos de restauração
-- Instantâneas (label + payload JSONB) dos dados do módulo
-- Minhas Finanças. O payload guarda as linhas das tabelas mf_*
-- (menos mf_import_* e as próprias mf_restore_points), permitindo
-- restaurar o estado anterior. Tabela aditiva, RLS por usuário.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_restore_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mf_restore_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "restore_points_own" ON public.mf_restore_points;
CREATE POLICY "restore_points_own" ON public.mf_restore_points
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mf_restore_points_user
  ON public.mf_restore_points (user_id, created_at DESC);
