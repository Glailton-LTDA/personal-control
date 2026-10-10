-- =============================================================
-- Minhas Finanças — agrupamento hierárquico de contas + fixa mensal
-- Migração ADITIVA (não altera colunas existentes).
-- =============================================================

-- -------------------------------------------------------------
-- 1. Grupos de contas (hierarquia via parent_id, padrão mf_categories)
--    show_in_summary: exibe o card na tela de Resumo
--    sum_totals:      soma os totais das contas do grupo (e subgrupos)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_account_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.mf_account_groups(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  icon TEXT,
  color TEXT,
  show_in_summary BOOLEAN NOT NULL DEFAULT true,
  sum_totals BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_mf_account_groups_user
  ON public.mf_account_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_account_groups_parent
  ON public.mf_account_groups(parent_id);

-- -------------------------------------------------------------
-- 2. Contas ganham grupo (ON DELETE SET NULL: apagar o grupo
--    apenas desvincula a conta, nunca apaga dados financeiros)
-- -------------------------------------------------------------
ALTER TABLE public.mf_accounts
  ADD COLUMN IF NOT EXISTS group_id UUID
  REFERENCES public.mf_account_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mf_accounts_group
  ON public.mf_accounts(group_id);

-- -------------------------------------------------------------
-- 3. Série fixa mensal: recorrência "eterna" até o usuário excluir.
--    `is_fixed` marca cada ocorrência da série; o estensor usa a
--    cabeça (parent_transaction_id IS NULL) como interruptor:
--    `is_fixed = false` na cabeça encerra o estendimento.
-- -------------------------------------------------------------
ALTER TABLE public.mf_transactions
  ADD COLUMN IF NOT EXISTS is_fixed BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mf_transactions_user_fixed
  ON public.mf_transactions(user_id, is_fixed)
  WHERE is_fixed;

-- -------------------------------------------------------------
-- 4. Trigger de updated_at (mesmo padrão das demais tabelas mf_*)
-- -------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mf_account_groups_updated_at
  ON public.mf_account_groups;
CREATE TRIGGER trg_mf_account_groups_updated_at
  BEFORE UPDATE ON public.mf_account_groups
  FOR EACH ROW EXECUTE FUNCTION public.mf_set_updated_at();

-- -------------------------------------------------------------
-- 5. Row Level Security: cada usuário só vê/altera os próprios grupos
-- -------------------------------------------------------------
ALTER TABLE public.mf_account_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own rows: select" ON public.mf_account_groups;
CREATE POLICY "own rows: select" ON public.mf_account_groups
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: insert" ON public.mf_account_groups;
CREATE POLICY "own rows: insert" ON public.mf_account_groups
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: update" ON public.mf_account_groups;
CREATE POLICY "own rows: update" ON public.mf_account_groups
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "own rows: delete" ON public.mf_account_groups;
CREATE POLICY "own rows: delete" ON public.mf_account_groups
  FOR DELETE TO authenticated USING (user_id = auth.uid());
