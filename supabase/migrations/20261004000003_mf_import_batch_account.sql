-- -------------------------------------------------------------
-- Fase 7 (2026-10-04): conta de destino do lote de importação
-- mf_import_batches não tinha vínculo com a conta que recebe o
-- extrato; coluna aditiva (mesma migração aplicada via MCP).
-- -------------------------------------------------------------
ALTER TABLE public.mf_import_batches
  ADD COLUMN IF NOT EXISTS account_id UUID
  REFERENCES public.mf_accounts(id) ON DELETE SET NULL;

-- Índice para o histórico por conta
CREATE INDEX IF NOT EXISTS idx_mf_import_batches_user
  ON public.mf_import_batches(user_id, created_at DESC);
