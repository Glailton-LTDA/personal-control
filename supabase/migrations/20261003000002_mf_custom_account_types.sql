-- =============================================================
-- Minhas Finanças — tipos de conta configuráveis pelo usuário
-- - Nova tabela mf_account_types (tipos personalizados, RLS auth.uid())
-- - mf_accounts.account_type aceita também nomes livres (até 60 chars)
--   além dos 6 códigos padrão (CORRENTE, POUPANCA, ...)
-- Nenhuma tabela existente fora do módulo mf_ é alterada.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Tipos de conta personalizados
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_account_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  icon TEXT NOT NULL DEFAULT '💳',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Nome único por usuário (case/espacos-insensível)
CREATE UNIQUE INDEX IF NOT EXISTS uq_mf_account_types_user_name
  ON public.mf_account_types(user_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_mf_account_types_user
  ON public.mf_account_types(user_id);

-- -------------------------------------------------------------
-- 2. Relaxa o CHECK de tipo em mf_accounts:
--    padrões (código fixo) ou nome personalizado (1..60 chars)
-- -------------------------------------------------------------
ALTER TABLE public.mf_accounts
  DROP CONSTRAINT IF EXISTS mf_accounts_account_type_check;

ALTER TABLE public.mf_accounts
  ADD CONSTRAINT mf_accounts_account_type_check
  CHECK (char_length(btrim(account_type)) BETWEEN 1 AND 60);

-- -------------------------------------------------------------
-- 3. Trigger de updated_at (mesmo padrão do módulo)
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mf_account_types_updated_at ON public.mf_account_types;
CREATE TRIGGER trg_mf_account_types_updated_at
  BEFORE UPDATE ON public.mf_account_types
  FOR EACH ROW EXECUTE FUNCTION public.mf_set_updated_at();

-- -------------------------------------------------------------
-- 4. Row Level Security (mesmo padrão do módulo)
-- -------------------------------------------------------------
ALTER TABLE public.mf_account_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows: select" ON public.mf_account_types;
CREATE POLICY "own rows: select" ON public.mf_account_types
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: insert" ON public.mf_account_types;
CREATE POLICY "own rows: insert" ON public.mf_account_types
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: update" ON public.mf_account_types;
CREATE POLICY "own rows: update" ON public.mf_account_types
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: delete" ON public.mf_account_types;
CREATE POLICY "own rows: delete" ON public.mf_account_types
  FOR DELETE TO authenticated USING (user_id = auth.uid());
