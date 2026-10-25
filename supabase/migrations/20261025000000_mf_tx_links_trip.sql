-- -------------------------------------------------------------
-- Integração Minhas Finanças × Viagens (Fatia 1)
--
-- Um lançamento do MF pode gerar um gasto espelho em uma viagem.
-- A gravação é atômica: lançamento (+ filhas do parcelado) + espelho +
-- vínculo numa única RPC. Editar/desligar refaz o espelho; excluir o
-- lançamento apaga o espelho por trigger (cobre também exclusão em
-- escopo de série e o cascade).
--
-- A tabela já nasce com as colunas de investimento (Fatia 2), mas esta
-- versão da RPC só trata viagem.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mf_tx_links (
  transaction_id UUID PRIMARY KEY
    REFERENCES public.mf_transactions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  trip_expense_id UUID REFERENCES public.trip_expenses(id) ON DELETE SET NULL,
  -- Reservados para a Fatia 2 (rendimento no investimento)
  investment_account_id UUID REFERENCES public.investment_accounts(id) ON DELETE SET NULL,
  investment_record_id UUID REFERENCES public.investment_records(id) ON DELETE SET NULL,
  investment_delta NUMERIC(14,2) NOT NULL DEFAULT 0,
  investment_created BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mf_tx_links_user ON public.mf_tx_links(user_id);
CREATE INDEX IF NOT EXISTS idx_mf_tx_links_trip ON public.mf_tx_links(trip_id);
CREATE INDEX IF NOT EXISTS idx_mf_tx_links_investment_record
  ON public.mf_tx_links(investment_record_id);

DROP TRIGGER IF EXISTS trg_mf_tx_links_updated_at ON public.mf_tx_links;
CREATE TRIGGER trg_mf_tx_links_updated_at
  BEFORE UPDATE ON public.mf_tx_links
  FOR EACH ROW EXECUTE FUNCTION public.mf_set_updated_at();

ALTER TABLE public.mf_tx_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mf_tx_links_own" ON public.mf_tx_links;
CREATE POLICY "mf_tx_links_own" ON public.mf_tx_links
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- -------------------------------------------------------------
-- Salvar lançamento + espelho (ou remover o espelho, com p_trip_id null)
--
-- p_tx            = linha de mf_transactions (campos do formulário)
-- p_tx_id         = id em edição (null = inserir)
-- p_trip_id       = viagem do espelho (null = sem integração)
-- p_children      = filhas da série (parcelado), inseridas na mesma transação
-- p_paid_by       = nome do perfil responsável (texto livre em trip_expenses)
-- p_mirror_amount = total do espelho (parcelado: parcela × nº de parcelas)
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_save_tx_linked(
  p_tx JSONB,
  p_tx_id UUID DEFAULT NULL,
  p_trip_id UUID DEFAULT NULL,
  p_investment_account_id UUID DEFAULT NULL,
  p_children JSONB DEFAULT '[]'::jsonb,
  p_paid_by TEXT DEFAULT NULL,
  p_mirror_amount NUMERIC DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
-- SECURITY INVOKER (padrão): as policies de mf_*, trips e trip_expenses valem.
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.mf_transactions;
  v_tx_id UUID;
  v_prev public.mf_tx_links;
  v_trip_expense_id UUID;
  v_currency TEXT;
  v_amount NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mf_tx_link_not_authenticated';
  END IF;

  IF p_investment_account_id IS NOT NULL THEN
    -- A Fatia 2 substitui esta função com o rendimento no investimento.
    RAISE EXCEPTION 'mf_tx_link_investment_not_available';
  END IF;

  v_row := jsonb_populate_record(NULL::public.mf_transactions, COALESCE(p_tx, '{}'::jsonb));
  IF v_row.type IS NULL OR v_row.type NOT IN ('DESPESA','RECEITA') THEN
    RAISE EXCEPTION 'mf_tx_link_type';
  END IF;
  IF v_row.account_id IS NULL OR v_row.description IS NULL OR btrim(v_row.description) = '' THEN
    RAISE EXCEPTION 'mf_tx_link_required';
  END IF;
  IF COALESCE(v_row.amount, 0) = 0 OR v_row.payment_date IS NULL THEN
    RAISE EXCEPTION 'mf_tx_link_required';
  END IF;

  IF p_tx_id IS NULL THEN
    v_tx_id := COALESCE(v_row.id, gen_random_uuid());
    INSERT INTO public.mf_transactions (
      id, user_id, account_id, transfer_account_id, type, description, amount,
      payment_date, due_date, effective_date, status, category_id, responsible_id,
      notes, attachment_path, recurrence, installments_current, installments_total,
      parent_transaction_id, invoice_close, auto_settle, is_fixed
    ) VALUES (
      v_tx_id, v_uid, v_row.account_id, v_row.transfer_account_id, v_row.type,
      v_row.description, v_row.amount, v_row.payment_date, v_row.due_date,
      v_row.effective_date, COALESCE(v_row.status, 'PENDENTE'), v_row.category_id,
      v_row.responsible_id, v_row.notes, v_row.attachment_path,
      COALESCE(v_row.recurrence, 'NONE'), v_row.installments_current,
      v_row.installments_total, v_row.parent_transaction_id, v_row.invoice_close,
      COALESCE(v_row.auto_settle, false), COALESCE(v_row.is_fixed, false)
    );

    INSERT INTO public.mf_transactions (
      id, user_id, account_id, transfer_account_id, type, description, amount,
      payment_date, due_date, effective_date, status, category_id, responsible_id,
      notes, attachment_path, recurrence, installments_current, installments_total,
      parent_transaction_id, invoice_close, auto_settle, is_fixed
    )
    SELECT
      COALESCE(c.id, gen_random_uuid()), v_uid, c.account_id, c.transfer_account_id,
      c.type, c.description, c.amount, c.payment_date, c.due_date, c.effective_date,
      COALESCE(c.status, 'PENDENTE'), c.category_id, c.responsible_id, c.notes,
      c.attachment_path, COALESCE(c.recurrence, 'NONE'), c.installments_current,
      c.installments_total, c.parent_transaction_id, c.invoice_close,
      COALESCE(c.auto_settle, false), COALESCE(c.is_fixed, false)
    FROM jsonb_populate_recordset(
      NULL::public.mf_transactions, COALESCE(p_children, '[]'::jsonb)
    ) AS c;
  ELSE
    UPDATE public.mf_transactions SET
      account_id = v_row.account_id,
      transfer_account_id = v_row.transfer_account_id,
      type = v_row.type,
      description = v_row.description,
      amount = v_row.amount,
      payment_date = v_row.payment_date,
      due_date = v_row.due_date,
      effective_date = v_row.effective_date,
      status = COALESCE(v_row.status, status),
      category_id = v_row.category_id,
      responsible_id = v_row.responsible_id,
      notes = v_row.notes,
      attachment_path = v_row.attachment_path,
      recurrence = COALESCE(v_row.recurrence, recurrence),
      -- Série: preserva quando o formulário não manda o campo.
      installments_current = COALESCE(v_row.installments_current, installments_current),
      installments_total = COALESCE(v_row.installments_total, installments_total),
      parent_transaction_id = COALESCE(v_row.parent_transaction_id, parent_transaction_id),
      invoice_close = COALESCE(v_row.invoice_close, invoice_close),
      auto_settle = COALESCE(v_row.auto_settle, auto_settle),
      is_fixed = COALESCE(v_row.is_fixed, is_fixed)
    WHERE id = p_tx_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mf_tx_link_not_found';
    END IF;
    v_tx_id := p_tx_id;
  END IF;

  SELECT * INTO v_prev FROM public.mf_tx_links WHERE transaction_id = v_tx_id FOR UPDATE;

  -- Desfaz o espelho anterior (edição ou desligar a integração).
  IF v_prev.trip_expense_id IS NOT NULL THEN
    DELETE FROM public.trip_expenses WHERE id = v_prev.trip_expense_id;
    v_prev.trip_expense_id := NULL;
    v_prev.trip_id := NULL;
  END IF;

  IF p_trip_id IS NOT NULL THEN
    IF v_row.type <> 'DESPESA' THEN
      RAISE EXCEPTION 'mf_tx_link_trip_type';
    END IF;
    IF COALESCE(v_row.status, 'PENDENTE') <> 'PAGO' THEN
      RAISE EXCEPTION 'mf_tx_link_status';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.trips WHERE id = p_trip_id) THEN
      RAISE EXCEPTION 'mf_tx_link_trip_not_found';
    END IF;

    SELECT COALESCE(currency, 'BRL') INTO v_currency
    FROM public.mf_accounts
    WHERE id = v_row.account_id AND user_id = v_uid;
    v_amount := COALESCE(p_mirror_amount, ABS(v_row.amount));

    INSERT INTO public.trip_expenses (
      trip_id, user_id, amount, currency, date, description, paid_by, status, category_id
    ) VALUES (
      p_trip_id, v_uid, v_amount, COALESCE(v_currency, 'BRL'), v_row.payment_date,
      v_row.description, NULLIF(btrim(COALESCE(p_paid_by, '')), ''), 'PAGO', NULL
    ) RETURNING id INTO v_trip_expense_id;

    INSERT INTO public.mf_tx_links (
      transaction_id, user_id, trip_id, trip_expense_id
    ) VALUES (v_tx_id, v_uid, p_trip_id, v_trip_expense_id)
    ON CONFLICT (transaction_id) DO UPDATE SET
      trip_id = EXCLUDED.trip_id,
      trip_expense_id = EXCLUDED.trip_expense_id,
      updated_at = now();
  ELSIF v_prev.transaction_id IS NOT NULL THEN
    UPDATE public.mf_tx_links
    SET trip_id = NULL, trip_expense_id = NULL, updated_at = now()
    WHERE transaction_id = v_tx_id;
    DELETE FROM public.mf_tx_links
    WHERE transaction_id = v_tx_id AND investment_account_id IS NULL;
  END IF;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mf_save_tx_linked(JSONB, UUID, UUID, UUID, JSONB, TEXT, NUMERIC)
  FROM public;
GRANT EXECUTE ON FUNCTION public.mf_save_tx_linked(JSONB, UUID, UUID, UUID, JSONB, TEXT, NUMERIC)
  TO authenticated;

-- -------------------------------------------------------------
-- Exclusão do lançamento: o espelho cai junto por qualquer caminho
-- (este, série, cascade). Trigger em vez de RPC para cobrir a exclusão
-- em escopo e o cascade de parcelas.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_cleanup_tx_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense UUID;
BEGIN
  SELECT trip_expense_id INTO v_expense
  FROM public.mf_tx_links
  WHERE transaction_id = OLD.id;

  IF v_expense IS NOT NULL THEN
    DELETE FROM public.trip_expenses WHERE id = v_expense;
  END IF;
  DELETE FROM public.mf_tx_links WHERE transaction_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_mf_cleanup_tx_links ON public.mf_transactions;
CREATE TRIGGER trg_mf_cleanup_tx_links
  BEFORE DELETE ON public.mf_transactions
  FOR EACH ROW EXECUTE FUNCTION public.mf_cleanup_tx_links();
