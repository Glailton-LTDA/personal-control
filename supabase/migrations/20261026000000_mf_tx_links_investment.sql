-- -------------------------------------------------------------
-- Integração Minhas Finanças × Investimentos (Fatia 2)
--
-- O mesmo vínculo de mf_tx_links que espelha um gasto na viagem passa a
-- lançar o rendimento em investment_records:
--   - RECEITA  → delta positivo      (yield e final_balance sobem)
--   - DESPESA  → delta negativo      (rendimento negativo / prejuízo)
--   - parcelado → um único delta com o valor total
--
-- Regras: só despesa/receita PAGA; conta do MF não pode ser cartão; moeda
-- da conta do MF tem que ser a mesma da conta de investimento.
--
-- Editar/excluir desfaz o delta anterior e aplica o novo. O registro
-- criado pela integração é apagado quando fica sem efeito (yield 0 e
-- final = initial) e é o último da série (para não quebrar a corrente
-- SI + rendimento = SF dos meses seguintes).
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
-- SECURITY INVOKER (padrão): as policies de mf_*, trips, trip_expenses e
-- investment_* valem.
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
  v_prev_paid_by TEXT;
  v_mf_type TEXT;
  v_inv_currency TEXT;
  v_delta NUMERIC := 0;
  v_record_id UUID;
  v_created BOOLEAN := false;
  v_month_start DATE;
  v_prev_final NUMERIC;
  v_rec public.investment_records;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mf_tx_link_not_authenticated';
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

  -- ---------------------------------------------------------------
  -- Desfaz os efeitos anteriores (edição ou desligar a integração)
  -- ---------------------------------------------------------------
  IF v_prev.trip_expense_id IS NOT NULL THEN
    -- Guarda o responsável atual: ele pode ter sido ajustado direto na
    -- viagem (o nome do perfil é só o padrão de criação).
    SELECT paid_by INTO v_prev_paid_by
    FROM public.trip_expenses WHERE id = v_prev.trip_expense_id;
    DELETE FROM public.trip_expenses WHERE id = v_prev.trip_expense_id;
    v_prev.trip_expense_id := NULL;
    v_prev.trip_id := NULL;
  END IF;

  IF v_prev.investment_record_id IS NOT NULL THEN
    UPDATE public.investment_records
       SET yield = yield - v_prev.investment_delta,
           final_balance = final_balance - v_prev.investment_delta
     WHERE id = v_prev.investment_record_id;
    -- Registro criado pela integração e sem efeito depois de desfazer:
    -- apaga, mas só se for o último da série (senão a corrente dos meses
    -- seguintes perderia a referência do saldo inicial).
    IF v_prev.investment_created THEN
      DELETE FROM public.investment_records ir
       WHERE ir.id = v_prev.investment_record_id
         AND ir.yield = 0
         AND ir.final_balance = ir.initial_balance
         AND NOT EXISTS (
           SELECT 1 FROM public.investment_records later
            WHERE later.account_id = ir.account_id
              AND later.record_date > ir.record_date
         );
    END IF;
    v_prev.investment_record_id := NULL;
    v_prev.investment_account_id := NULL;
  END IF;

  -- ---------------------------------------------------------------
  -- Espelho na viagem
  -- ---------------------------------------------------------------
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
      v_row.description,
      -- Na edição, mantém o responsável que já estava no espelho: ele pode
      -- ter sido ajustado na viagem. O nome do perfil é o padrão de criação.
      COALESCE(v_prev_paid_by, NULLIF(btrim(COALESCE(p_paid_by, '')), '')),
      'PAGO', NULL
    ) RETURNING id INTO v_trip_expense_id;
  END IF;

  -- ---------------------------------------------------------------
  -- Rendimento no investimento
  -- ---------------------------------------------------------------
  IF p_investment_account_id IS NOT NULL THEN
    IF COALESCE(v_row.status, 'PENDENTE') <> 'PAGO' THEN
      RAISE EXCEPTION 'mf_tx_link_status';
    END IF;

    SELECT a.account_type, COALESCE(a.currency, 'BRL') INTO v_mf_type, v_currency
    FROM public.mf_accounts a
    WHERE a.id = v_row.account_id AND a.user_id = v_uid;
    IF v_mf_type IS NULL THEN
      RAISE EXCEPTION 'mf_tx_link_required';
    END IF;
    IF v_mf_type = 'CARTAO' THEN
      RAISE EXCEPTION 'mf_tx_link_investment_card';
    END IF;

    SELECT COALESCE(currency, 'BRL') INTO v_inv_currency
    FROM public.investment_accounts
    WHERE id = p_investment_account_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mf_tx_link_investment_not_found';
    END IF;
    IF v_inv_currency IS DISTINCT FROM COALESCE(v_currency, 'BRL') THEN
      RAISE EXCEPTION 'mf_tx_link_investment_currency';
    END IF;

    v_amount := COALESCE(p_mirror_amount, ABS(v_row.amount));
    v_delta := CASE WHEN v_row.type = 'RECEITA' THEN v_amount ELSE -v_amount END;
    v_month_start := date_trunc('month', v_row.payment_date)::date;
    v_created := false;

    SELECT * INTO v_rec
    FROM public.investment_records
    WHERE account_id = p_investment_account_id
      AND user_id = v_uid
      AND record_date >= v_month_start
      AND record_date < (v_month_start + INTERVAL '1 month')
    ORDER BY record_date DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.investment_records
         SET yield = yield + v_delta,
             final_balance = final_balance + v_delta
       WHERE id = v_rec.id;
      v_record_id := v_rec.id;
      -- Herda o marcador dos vínculos que já usam o registro: se ele foi
      -- criado pela integração, qualquer vínculo pode apagá-lo quando
      -- ficar sem efeito (inclusive depois que o criador for excluído).
      SELECT EXISTS (
        SELECT 1 FROM public.mf_tx_links l
         WHERE l.investment_record_id = v_rec.id
           AND l.investment_created
      ) INTO v_created;
    ELSE
      SELECT final_balance INTO v_prev_final
      FROM public.investment_records
      WHERE account_id = p_investment_account_id
        AND user_id = v_uid
        AND record_date < v_month_start
      ORDER BY record_date DESC
      LIMIT 1;
      v_prev_final := COALESCE(v_prev_final, 0);

      INSERT INTO public.investment_records (
        user_id, account_id, record_date, initial_balance, yield, final_balance
      ) VALUES (
        v_uid, p_investment_account_id, v_row.payment_date,
        v_prev_final, v_delta, v_prev_final + v_delta
      ) RETURNING id INTO v_record_id;
      v_created := true;
    END IF;
  END IF;

  -- ---------------------------------------------------------------
  -- Vínculo
  -- ---------------------------------------------------------------
  IF p_trip_id IS NOT NULL OR p_investment_account_id IS NOT NULL THEN
    INSERT INTO public.mf_tx_links (
      transaction_id, user_id, trip_id, trip_expense_id,
      investment_account_id, investment_record_id, investment_delta, investment_created
    ) VALUES (
      v_tx_id, v_uid, p_trip_id, v_trip_expense_id,
      p_investment_account_id, v_record_id, v_delta, v_created
    )
    ON CONFLICT (transaction_id) DO UPDATE SET
      trip_id = EXCLUDED.trip_id,
      trip_expense_id = EXCLUDED.trip_expense_id,
      investment_account_id = EXCLUDED.investment_account_id,
      investment_record_id = EXCLUDED.investment_record_id,
      investment_delta = EXCLUDED.investment_delta,
      investment_created = EXCLUDED.investment_created,
      updated_at = now();
  ELSIF v_prev.transaction_id IS NOT NULL THEN
    DELETE FROM public.mf_tx_links WHERE transaction_id = v_tx_id;
  END IF;

  RETURN v_tx_id;
END;
$$;

REVOKE ALL ON FUNCTION public.mf_save_tx_linked(JSONB, UUID, UUID, UUID, JSONB, TEXT, NUMERIC)
  FROM public;
GRANT EXECUTE ON FUNCTION public.mf_save_tx_linked(JSONB, UUID, UUID, UUID, JSONB, TEXT, NUMERIC)
  TO authenticated;

-- -------------------------------------------------------------
-- Exclusão do lançamento: viagem e investimento caem junto por
-- qualquer caminho (este, série, cascade).
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_cleanup_tx_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expense UUID;
  v_record UUID;
  v_delta NUMERIC;
  v_created BOOLEAN;
BEGIN
  SELECT trip_expense_id, investment_record_id, investment_delta, investment_created
    INTO v_expense, v_record, v_delta, v_created
  FROM public.mf_tx_links
  WHERE transaction_id = OLD.id;

  IF v_expense IS NOT NULL THEN
    DELETE FROM public.trip_expenses WHERE id = v_expense;
  END IF;

  IF v_record IS NOT NULL THEN
    UPDATE public.investment_records
       SET yield = yield - v_delta,
           final_balance = final_balance - v_delta
     WHERE id = v_record;

    IF v_created THEN
      DELETE FROM public.investment_records ir
       WHERE ir.id = v_record
         AND ir.yield = 0
         AND ir.final_balance = ir.initial_balance
         AND NOT EXISTS (
           SELECT 1 FROM public.investment_records later
            WHERE later.account_id = ir.account_id
              AND later.record_date > ir.record_date
         );
    END IF;
  END IF;

  DELETE FROM public.mf_tx_links WHERE transaction_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_mf_cleanup_tx_links ON public.mf_transactions;
CREATE TRIGGER trg_mf_cleanup_tx_links
  BEFORE DELETE ON public.mf_transactions
  FOR EACH ROW EXECUTE FUNCTION public.mf_cleanup_tx_links();

-- -------------------------------------------------------------
-- Um registro por conta de investimento por MÊS. Sem isso, dois
-- lançamentos no mesmo mês podem criar registros paralelos (as 3
-- duplicatas limpas em produção em 2026-10-26).
-- -------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_investment_records_account_month
  ON public.investment_records (
    account_id,
    ((date_trunc('month', record_date::timestamp))::date)
  );
