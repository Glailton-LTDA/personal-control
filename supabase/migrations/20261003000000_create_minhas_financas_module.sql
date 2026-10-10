-- =============================================================
-- Módulo "Minhas Finanças" — Fase 0: modelo de dados
-- Prefixo de tabelas: mf_ (nenhuma tabela existente é alterada)
-- Todas as tabelas possuem user_id + RLS = auth.uid()
-- =============================================================

-- -------------------------------------------------------------
-- Função auxiliar para manter updated_at
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

-- -------------------------------------------------------------
-- 1. Contas e cartões (carteiras)
--    account_type = 'CARTAO' usa closing_day/due_day/credit_limit
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'CORRENTE'
    CHECK (account_type IN ('CORRENTE','POUPANCA','DINHEIRO','CARTAO','INVESTIMENTO','OUTRO')),
  initial_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  color TEXT,
  icon TEXT,
  image_url TEXT,
  closing_day INTEGER CHECK (closing_day BETWEEN 1 AND 31),
  due_day INTEGER CHECK (due_day BETWEEN 1 AND 31),
  credit_limit NUMERIC(14,2),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -------------------------------------------------------------
-- 2. Categorias (com suporte a subcategorias via parent_id)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('DESPESA','RECEITA','AMBAS')),
  parent_id UUID REFERENCES public.mf_categories(id) ON DELETE CASCADE,
  color TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (parent_id IS NULL OR parent_id <> id)
);

-- -------------------------------------------------------------
-- 3. Responsáveis (quem paga/recebe — perfis)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_responsibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  color TEXT,
  is_main BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -------------------------------------------------------------
-- 4. Lançamentos (tabela central)
--    payment_date  = data de competência (entra em saldos/relatórios)
--    due_date      = vencimento
--    effective_date= data em que efetivamente pagou/recebeu
--    amount        > 0; valores negativos permitidos p/ estorno/reembolso
--    TRANSFERENCIA exige transfer_account_id (destino)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.mf_accounts(id) ON DELETE RESTRICT,
  transfer_account_id UUID REFERENCES public.mf_accounts(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('DESPESA','RECEITA','TRANSFERENCIA')),
  description TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount <> 0),
  payment_date DATE NOT NULL,
  due_date DATE,
  effective_date DATE,
  status TEXT NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE','PAGO','CANCELADO')),
  category_id UUID REFERENCES public.mf_categories(id) ON DELETE SET NULL,
  responsible_id UUID REFERENCES public.mf_responsibles(id) ON DELETE SET NULL,
  notes TEXT,
  attachment_path TEXT,
  -- recorrência e parcelamento
  recurrence TEXT NOT NULL DEFAULT 'NONE'
    CHECK (recurrence IN ('NONE','WEEKLY','MONTHLY','YEARLY')),
  installments_current INTEGER,
  installments_total INTEGER,
  parent_transaction_id UUID REFERENCES public.mf_transactions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  -- transferência precisa de conta de destino
  CHECK (type <> 'TRANSFERENCIA' OR transfer_account_id IS NOT NULL),
  -- transferência não usa categoria
  CHECK (type <> 'TRANSFERENCIA' OR category_id IS NULL),
  -- parcelamento coerente
  CHECK (
    (installments_current IS NULL AND installments_total IS NULL)
    OR (installments_current >= 1 AND installments_total >= 1 AND installments_current <= installments_total)
  ),
  CHECK (parent_transaction_id IS NULL OR (installments_current IS NOT NULL OR recurrence <> 'NONE')),
  UNIQUE (parent_transaction_id, installments_current)
);

-- -------------------------------------------------------------
-- 5. Tags e vinculação a lançamentos
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS public.mf_transaction_tags (
  transaction_id UUID NOT NULL REFERENCES public.mf_transactions(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.mf_tags(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (transaction_id, tag_id)
);

-- -------------------------------------------------------------
-- 6. Orçamentos (limite por categoria, tag, conta ou global)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES public.mf_categories(id) ON DELETE CASCADE,
  tag_id UUID REFERENCES public.mf_tags(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.mf_accounts(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  mode TEXT NOT NULL DEFAULT 'FIXED' CHECK (mode IN ('FIXED','PERCENT')),
  amount NUMERIC(14,2),
  percent_of_income NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CHECK (period_end >= period_start),
  -- escopo: no máximo um destino (categoria, tag ou conta)
  CHECK (
    (CASE WHEN category_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN tag_id IS NOT NULL THEN 1 ELSE 0 END)
    + (CASE WHEN account_id IS NOT NULL THEN 1 ELSE 0 END)
    <= 1
  ),
  -- valor: fixo OU percentual
  CHECK (
    (mode = 'FIXED' AND amount IS NOT NULL AND amount > 0 AND percent_of_income IS NULL)
    OR (mode = 'PERCENT' AND percent_of_income IS NOT NULL AND percent_of_income > 0 AND amount IS NULL)
  )
);

-- -------------------------------------------------------------
-- 7. Objetivos (metas) e aportes
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(14,2) NOT NULL CHECK (target_amount > 0),
  initial_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  target_date DATE,
  account_id UUID REFERENCES public.mf_accounts(id) ON DELETE SET NULL,
  color TEXT,
  icon TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE','COMPLETED','ARCHIVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.mf_goal_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.mf_goals(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('DEPOSIT','WITHDRAW')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  contribution_date DATE NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -------------------------------------------------------------
-- 8. Relatórios salvos (filtros persistidos)
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -------------------------------------------------------------
-- 9. Importação (OFX/CSV) com etapa de conciliação
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('OFX','CSV','XLSX')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','REVIEWED','COMPLETED','CANCELLED')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.mf_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.mf_import_batches(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_transaction_id UUID REFERENCES public.mf_transactions(id) ON DELETE SET NULL,
  imported_transaction_id UUID REFERENCES public.mf_transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW','SUGGESTED','MATCHED','IGNORED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- -------------------------------------------------------------
-- Índices
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_mf_accounts_user ON public.mf_accounts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_mf_categories_user ON public.mf_categories(user_id, type);
CREATE INDEX IF NOT EXISTS idx_mf_categories_parent ON public.mf_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_mf_transactions_user_payment_date
  ON public.mf_transactions(user_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_mf_transactions_user_account_date
  ON public.mf_transactions(user_id, account_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_mf_transactions_user_due_date
  ON public.mf_transactions(user_id, due_date);
CREATE INDEX IF NOT EXISTS idx_mf_transactions_user_status
  ON public.mf_transactions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_mf_transactions_category
  ON public.mf_transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_mf_transactions_parent
  ON public.mf_transactions(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_mf_transaction_tags_tag
  ON public.mf_transaction_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_mf_budgets_user_period
  ON public.mf_budgets(user_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_mf_goals_user_status
  ON public.mf_goals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_mf_goal_contributions_goal
  ON public.mf_goal_contributions(goal_id);
CREATE INDEX IF NOT EXISTS idx_mf_import_rows_batch
  ON public.mf_import_rows(batch_id, status);

-- -------------------------------------------------------------
-- Triggers de updated_at
-- -------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mf_accounts','mf_categories','mf_responsibles','mf_transactions',
    'mf_tags','mf_budgets','mf_goals','mf_saved_reports','mf_import_batches'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I '
      || 'FOR EACH ROW EXECUTE FUNCTION public.mf_set_updated_at()', t, t);
  END LOOP;
END $$;

-- -------------------------------------------------------------
-- Row Level Security: cada usuário só vê/altera os próprios dados
-- -------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mf_accounts','mf_categories','mf_responsibles','mf_transactions',
    'mf_tags','mf_transaction_tags','mf_budgets','mf_goals',
    'mf_goal_contributions','mf_saved_reports','mf_import_batches','mf_import_rows'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS "own rows: select" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "own rows: select" ON public.%I '
      || 'FOR SELECT TO authenticated USING (user_id = auth.uid())', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS "own rows: insert" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "own rows: insert" ON public.%I '
      || 'FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid())', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS "own rows: update" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "own rows: update" ON public.%I '
      || 'FOR UPDATE TO authenticated '
      || 'USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);

    EXECUTE format(
      'DROP POLICY IF EXISTS "own rows: delete" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "own rows: delete" ON public.%I '
      || 'FOR DELETE TO authenticated USING (user_id = auth.uid())', t);
  END LOOP;
END $$;
