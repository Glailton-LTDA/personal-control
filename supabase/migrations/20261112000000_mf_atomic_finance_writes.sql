-- Escritas transacionais do módulo Minhas Finanças.
--
-- 1) mf_save_tx_linked: passa a gravar as filhas (parcelas/série) também na
--    EDIÇÃO — antes só eram gravadas na criação, então converter um
--    lançamento em série linked salvava só a cabeça. A cabeça, as filhas e o
--    espelho continuam na mesma transação. Também passa a reconhecer o
--    retry pelo id da cabeça (idempotente).
--
-- 2) mf_pay_card_invoice: pagamento, crédito, parcelas, encargos e a
--    remoção dos espelhos numa transação só. Antes eram requisições
--    separadas: uma falha no meio deixava a fatura paga pela metade.
--
-- 3) mf_save_tx_with_goal: receita + aporte do objetivo na mesma
--    transação, idempotente pelo id da operação — o retry devolve o
--    resultado existente em vez de duplicar a receita.

set lock_timeout = '5s';
set statement_timeout = '60s';

-- ------------------------------------------------------------------
-- 1) mf_save_tx_linked — filhas também na edição + retry idempotente
-- ------------------------------------------------------------------
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
  v_child public.mf_transactions;
  v_tx_id UUID;
  v_child_id UUID;
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

  v_tx_id := COALESCE(p_tx_id, v_row.id, gen_random_uuid());

  -- Cabeça: cria ou atualiza. Na criação, se o id já existir, é retry da
  -- mesma operação (mesmo id) — atualiza em vez de duplicar.
  IF p_tx_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.mf_transactions WHERE id = v_tx_id) THEN
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
    WHERE id = v_tx_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mf_tx_link_not_found';
    END IF;
  ELSE
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
  END IF;

  -- Filhas (parcelas/série): o pai é a cabeça e a conta é do dono. Grava
  -- na MESMA transação da cabeça — vale tanto na criação quanto na edição
  -- (converter um avulso em série linked precisa gravar as filhas).
  IF jsonb_array_length(COALESCE(p_children, '[]'::jsonb)) > 0 THEN
    FOR v_child IN
      SELECT * FROM jsonb_populate_recordset(
        NULL::public.mf_transactions, COALESCE(p_children, '[]'::jsonb)
      )
    LOOP
      IF v_child.parent_transaction_id IS NULL
         OR v_child.parent_transaction_id IS DISTINCT FROM v_tx_id THEN
        RAISE EXCEPTION 'mf_tx_link_child_parent';
      END IF;
      IF v_child.account_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.mf_accounts a
        WHERE a.id = v_child.account_id AND a.user_id = v_uid
      ) THEN
        RAISE EXCEPTION 'mf_tx_link_child_account';
      END IF;
      v_child_id := COALESCE(v_child.id, gen_random_uuid());
      IF EXISTS (SELECT 1 FROM public.mf_transactions WHERE id = v_child_id) THEN
        -- Retry: a filha já existe — atualiza no lugar.
        UPDATE public.mf_transactions t SET
          account_id = v_child.account_id,
          transfer_account_id = v_child.transfer_account_id,
          type = v_child.type,
          description = v_child.description,
          amount = v_child.amount,
          payment_date = v_child.payment_date,
          due_date = v_child.due_date,
          effective_date = v_child.effective_date,
          status = COALESCE(v_child.status, t.status),
          category_id = v_child.category_id,
          notes = v_child.notes,
          attachment_path = v_child.attachment_path,
          recurrence = COALESCE(v_child.recurrence, t.recurrence),
          installments_current = v_child.installments_current,
          installments_total = v_child.installments_total,
          invoice_close = v_child.invoice_close,
          auto_settle = COALESCE(v_child.auto_settle, t.auto_settle),
          is_fixed = COALESCE(v_child.is_fixed, t.is_fixed)
        WHERE t.id = v_child_id AND t.user_id = v_uid;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'mf_tx_link_child_not_found';
        END IF;
      ELSE
        INSERT INTO public.mf_transactions (
          id, user_id, account_id, transfer_account_id, type, description, amount,
          payment_date, due_date, effective_date, status, category_id, responsible_id,
          notes, attachment_path, recurrence, installments_current, installments_total,
          parent_transaction_id, invoice_close, auto_settle, is_fixed
        ) VALUES (
          v_child_id, v_uid, v_child.account_id, v_child.transfer_account_id, v_child.type,
          v_child.description, v_child.amount, v_child.payment_date, v_child.due_date,
          v_child.effective_date, COALESCE(v_child.status, 'PENDENTE'), v_child.category_id,
          v_child.responsible_id, v_child.notes, v_child.attachment_path,
          COALESCE(v_child.recurrence, 'NONE'), v_child.installments_current,
          v_child.installments_total, v_tx_id, v_child.invoice_close,
          COALESCE(v_child.auto_settle, false), COALESCE(v_child.is_fixed, false)
        );
      END IF;
    END LOOP;
  END IF;

  SELECT * INTO v_prev FROM public.mf_tx_links WHERE transaction_id = v_tx_id FOR UPDATE;
  -- Vínculos antigos também são entrada não confiável: nunca desfazer
  -- efeitos fora do dono autenticado, mesmo antes do novo guard existir.
  IF v_prev.transaction_id IS NOT NULL AND v_prev.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'mf_legacy_link_requires_review' USING ERRCODE='42501';
  END IF;
  IF v_prev.trip_expense_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.trip_expenses e WHERE e.id=v_prev.trip_expense_id
      AND e.user_id=v_uid AND e.trip_id=v_prev.trip_id
  ) THEN RAISE EXCEPTION 'mf_legacy_link_requires_review' USING ERRCODE='42501'; END IF;
  IF v_prev.investment_record_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.investment_records r WHERE r.id=v_prev.investment_record_id
      AND r.user_id=v_uid AND r.account_id=v_prev.investment_account_id
  ) THEN RAISE EXCEPTION 'mf_legacy_link_requires_review' USING ERRCODE='42501'; END IF;

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

alter function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) security definer;
alter function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) set search_path=pg_catalog,public,pg_temp;
revoke all on function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) from public,anon;
grant execute on function public.mf_save_tx_linked(jsonb,uuid,uuid,uuid,jsonb,text,numeric) to authenticated;

-- ------------------------------------------------------------------
-- 2) mf_pay_card_invoice — pagamento da fatura numa transação só
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_pay_card_invoice(
  p_card_id UUID,
  p_account_id UUID,
  p_invoice_close DATE,
  p_payment JSONB DEFAULT NULL,
  p_extras JSONB DEFAULT '[]'::jsonb,
  p_replace_all BOOLEAN DEFAULT false,
  p_open_amount NUMERIC DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_linked UUID;
  v_row public.mf_transactions;
  v_payment_row public.mf_transactions;
  v_extra_row public.mf_transactions;
  v_existing public.mf_transactions;
  v_pending_rows public.mf_transactions[] := '{}'::public.mf_transactions[];
  v_payment_id UUID;
  v_extra_id UUID;
  v_purchases NUMERIC := 0;
  v_paid_final NUMERIC := 0;
  v_pending NUMERIC := 0;
  v_open NUMERIC := 0;
  v_allowed NUMERIC := 0;
  v_extra_ids JSONB := '[]'::jsonb;
  v_deleted_ids JSONB := '[]'::jsonb;
  v_notes_marker TEXT := 'Agendado automaticamente (fatura)';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mf_pay_card_not_authenticated';
  END IF;

  -- O cartão e a conta vinculada têm que ser do dono.
  SELECT a.linked_account_id INTO v_linked
  FROM public.mf_accounts a
  WHERE a.id = p_card_id AND a.user_id = v_uid AND a.account_type = 'CARTAO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'mf_pay_card_not_found';
  END IF;
  IF v_linked IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'mf_pay_card_account';
  END IF;

  -- Trava as linhas pendentes da fatura: nenhuma outra operação entra
  -- enquanto esta não terminar.
  FOR v_row IN
    SELECT t.* FROM public.mf_transactions t
    WHERE t.user_id = v_uid
      AND t.account_id = p_account_id
      AND t.type = 'DESPESA'
      AND t.invoice_close = p_invoice_close
      AND t.status = 'PENDENTE'
    FOR UPDATE
  LOOP
    v_pending_rows := array_append(v_pending_rows, v_row);
  END LOOP;

  -- Recompõe o saldo financiável da fatura: compras do cartão menos o que
  -- já foi pago (o agendado continua em aberto até ser efetivado).
  SELECT COALESCE(SUM(t.amount), 0) INTO v_purchases
  FROM public.mf_transactions t
  WHERE t.user_id = v_uid
    AND t.account_id = p_card_id
    AND t.type = 'DESPESA'
    AND t.invoice_close = p_invoice_close
    AND t.status IS DISTINCT FROM 'CANCELADO'
    AND t.amount > 0;

  SELECT COALESCE(SUM(t.amount), 0) INTO v_paid_final
  FROM public.mf_transactions t
  WHERE t.user_id = v_uid
    AND t.account_id = p_account_id
    AND t.type = 'DESPESA'
    AND t.invoice_close = p_invoice_close
    AND t.status IS DISTINCT FROM 'CANCELADO'
    AND t.status <> 'PENDENTE';

  SELECT COALESCE(SUM(t.amount), 0) INTO v_pending
  FROM public.mf_transactions t
  WHERE t.user_id = v_uid
    AND t.account_id = p_account_id
    AND t.type = 'DESPESA'
    AND t.invoice_close = p_invoice_close
    AND t.status = 'PENDENTE';

  v_open := v_purchases - v_paid_final;

  IF p_payment IS NOT NULL THEN
    v_payment_row := jsonb_populate_record(NULL::public.mf_transactions, p_payment);
    IF COALESCE(v_payment_row.amount, 0) <= 0 THEN
      RAISE EXCEPTION 'mf_pay_card_amount';
    END IF;
    -- Revalida o saldo financiável: o pagamento não pode passar do que a
    -- fatura tem em aberto. O servidor usa o maior entre o total que
    -- recompõe e o valor informado pela tela (que já foi validado com os
    -- agregados do servidor) — assim dado legado não bloqueia o pagamento.
    v_allowed := GREATEST(v_open + v_pending, COALESCE(p_open_amount, 0));
    IF v_payment_row.amount > v_allowed + 0.01 THEN
      RAISE EXCEPTION 'mf_pay_card_amount';
    END IF;
    -- Fatura já quitada: não existe o que pagar de novo.
    IF v_purchases > 0 AND (v_open + v_pending) <= 0.01 THEN
      RAISE EXCEPTION 'mf_pay_card_settled';
    END IF;
  END IF;

  -- Pagamento: reusa a linha pendente mais recente (um único débito por
  -- fatura) ou cria uma nova.
  IF p_payment IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM unnest(v_pending_rows) r
    ORDER BY r.payment_date DESC NULLS LAST
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      UPDATE public.mf_transactions SET
        account_id = v_payment_row.account_id,
        type = v_payment_row.type,
        description = v_payment_row.description,
        amount = v_payment_row.amount,
        payment_date = v_payment_row.payment_date,
        due_date = v_payment_row.due_date,
        effective_date = v_payment_row.effective_date,
        status = COALESCE(v_payment_row.status, status),
        category_id = v_payment_row.category_id,
        notes = v_payment_row.notes,
        attachment_path = v_payment_row.attachment_path,
        recurrence = COALESCE(v_payment_row.recurrence, recurrence),
        auto_settle = COALESCE(v_payment_row.auto_settle, auto_settle),
        invoice_close = p_invoice_close
      WHERE id = v_existing.id AND user_id = v_uid;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'mf_pay_card_not_found';
      END IF;
      v_payment_id := v_existing.id;
    ELSE
      INSERT INTO public.mf_transactions (
        id, user_id, account_id, transfer_account_id, type, description, amount,
        payment_date, due_date, effective_date, status, category_id, responsible_id,
        notes, attachment_path, recurrence, installments_current, installments_total,
        parent_transaction_id, invoice_close, auto_settle, is_fixed
      ) VALUES (
        COALESCE(v_payment_row.id, gen_random_uuid()), v_uid, v_payment_row.account_id,
        v_payment_row.transfer_account_id, v_payment_row.type, v_payment_row.description,
        v_payment_row.amount, v_payment_row.payment_date, v_payment_row.due_date,
        v_payment_row.effective_date, COALESCE(v_payment_row.status, 'PENDENTE'),
        v_payment_row.category_id, v_payment_row.responsible_id, v_payment_row.notes,
        v_payment_row.attachment_path, COALESCE(v_payment_row.recurrence, 'NONE'),
        v_payment_row.installments_current, v_payment_row.installments_total,
        v_payment_row.parent_transaction_id, p_invoice_close,
        COALESCE(v_payment_row.auto_settle, false), COALESCE(v_payment_row.is_fixed, false)
      ) RETURNING id INTO v_payment_id;
    END IF;
  END IF;

  -- Extras: crédito do parcelamento, parcelas e encargos.
  FOR v_extra_row IN
    SELECT * FROM jsonb_populate_recordset(
      NULL::public.mf_transactions, COALESCE(p_extras, '[]'::jsonb)
    )
  LOOP
    IF v_extra_row.account_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.mf_accounts a
      WHERE a.id = v_extra_row.account_id AND a.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'mf_pay_card_extra_account';
    END IF;
    INSERT INTO public.mf_transactions (
      id, user_id, account_id, transfer_account_id, type, description, amount,
      payment_date, due_date, effective_date, status, category_id, responsible_id,
      notes, attachment_path, recurrence, installments_current, installments_total,
      parent_transaction_id, invoice_close, auto_settle, is_fixed
    ) VALUES (
      COALESCE(v_extra_row.id, gen_random_uuid()), v_uid, v_extra_row.account_id,
      v_extra_row.transfer_account_id, v_extra_row.type, v_extra_row.description,
      v_extra_row.amount, v_extra_row.payment_date, v_extra_row.due_date,
      v_extra_row.effective_date, COALESCE(v_extra_row.status, 'PENDENTE'),
      v_extra_row.category_id, v_extra_row.responsible_id, v_extra_row.notes,
      v_extra_row.attachment_path, COALESCE(v_extra_row.recurrence, 'NONE'),
      v_extra_row.installments_current, v_extra_row.installments_total,
      v_extra_row.parent_transaction_id, v_extra_row.invoice_close,
      COALESCE(v_extra_row.auto_settle, false), COALESCE(v_extra_row.is_fixed, false)
    ) RETURNING id INTO v_extra_id;
    v_extra_ids := v_extra_ids || to_jsonb(v_extra_id);
  END LOOP;

  -- Espelhos: quando há pagamento, sai só o espelho duplicado; sem
  -- pagamento (fatura totalmente financiada), sai tudo.
  FOR v_row IN SELECT * FROM unnest(v_pending_rows) r
  LOOP
    IF p_replace_all
       OR (p_payment IS NOT NULL
           AND v_row.notes = v_notes_marker
           AND v_row.id IS DISTINCT FROM v_payment_id) THEN
      DELETE FROM public.mf_transactions WHERE id = v_row.id AND user_id = v_uid;
      v_deleted_ids := v_deleted_ids || to_jsonb(v_row.id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'payment_id', v_payment_id,
    'extra_ids', v_extra_ids,
    'deleted_ids', v_deleted_ids
  );
END;
$$;

revoke all on function public.mf_pay_card_invoice(uuid,uuid,date,jsonb,jsonb,boolean,numeric) from public,anon;
grant execute on function public.mf_pay_card_invoice(uuid,uuid,date,jsonb,jsonb,boolean,numeric) to authenticated;

-- ------------------------------------------------------------------
-- 3) mf_save_tx_with_goal — receita + aporte numa transação só
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_save_tx_with_goal(
  p_operation_id UUID,
  p_tx JSONB,
  p_goal_contribution JSONB DEFAULT NULL,
  p_delete_contribution BOOLEAN DEFAULT false
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.mf_transactions;
  v_contribution public.mf_goal_contributions;
  v_tx_id UUID;
  v_contribution_id UUID;
  v_exists BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'mf_goal_tx_not_authenticated';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'mf_goal_tx_required';
  END IF;

  v_row := jsonb_populate_record(NULL::public.mf_transactions, COALESCE(p_tx, '{}'::jsonb));
  IF v_row.type IS NULL OR v_row.type NOT IN ('DESPESA','RECEITA') THEN
    RAISE EXCEPTION 'mf_goal_tx_type';
  END IF;
  IF v_row.account_id IS NULL OR v_row.description IS NULL OR btrim(v_row.description) = '' THEN
    RAISE EXCEPTION 'mf_goal_tx_required';
  END IF;
  IF COALESCE(v_row.amount, 0) = 0 OR v_row.payment_date IS NULL THEN
    RAISE EXCEPTION 'mf_goal_tx_required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.mf_accounts a
    WHERE a.id = v_row.account_id AND a.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'mf_goal_tx_account';
  END IF;

  -- O id da operação É o id do lançamento: o retry manda o mesmo id e o
  -- servidor reconhece a repetição em vez de criar outra receita.
  v_tx_id := p_operation_id;

  SELECT EXISTS (
    SELECT 1 FROM public.mf_transactions WHERE id = v_tx_id
  ) INTO v_exists;

  IF v_exists THEN
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
      notes = v_row.notes,
      attachment_path = v_row.attachment_path,
      recurrence = COALESCE(v_row.recurrence, recurrence),
      invoice_close = v_row.invoice_close,
      auto_settle = COALESCE(v_row.auto_settle, auto_settle)
    WHERE id = v_tx_id AND user_id = v_uid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'mf_goal_tx_not_found';
    END IF;
  ELSE
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
  END IF;

  -- Aporte do objetivo: uma linha por lançamento (índice único em
  -- transaction_id). O retry atualiza a mesma linha.
  IF p_goal_contribution IS NOT NULL THEN
    v_contribution := jsonb_populate_record(
      NULL::public.mf_goal_contributions, p_goal_contribution
    );
    IF v_contribution.goal_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.mf_goals g
         WHERE g.id = v_contribution.goal_id AND g.user_id = v_uid
       ) THEN
      RAISE EXCEPTION 'mf_goal_contribution_goal';
    END IF;
    IF COALESCE(v_contribution.amount, 0) <= 0
       OR v_contribution.contribution_date IS NULL THEN
      RAISE EXCEPTION 'mf_goal_contribution_required';
    END IF;

    SELECT id INTO v_contribution_id
    FROM public.mf_goal_contributions
    WHERE transaction_id = v_tx_id AND user_id = v_uid;

    IF v_contribution_id IS NOT NULL THEN
      UPDATE public.mf_goal_contributions SET
        goal_id = v_contribution.goal_id,
        kind = v_contribution.kind,
        amount = v_contribution.amount,
        contribution_date = v_contribution.contribution_date,
        notes = v_contribution.notes,
        updated_at = now()
      WHERE id = v_contribution_id AND user_id = v_uid;
    ELSE
      INSERT INTO public.mf_goal_contributions (
        id, user_id, goal_id, kind, amount, contribution_date, notes,
        transaction_id, updated_at
      ) VALUES (
        COALESCE(v_contribution.id, gen_random_uuid()), v_uid, v_contribution.goal_id,
        v_contribution.kind, v_contribution.amount, v_contribution.contribution_date,
        v_contribution.notes, v_tx_id, now()
      ) RETURNING id INTO v_contribution_id;
    END IF;
  ELSIF p_delete_contribution THEN
    DELETE FROM public.mf_goal_contributions
    WHERE transaction_id = v_tx_id AND user_id = v_uid;
  END IF;

  RETURN jsonb_build_object(
    'transaction_id', v_tx_id,
    'contribution_id', v_contribution_id
  );
END;
$$;

revoke all on function public.mf_save_tx_with_goal(uuid,jsonb,jsonb,boolean) from public,anon;
grant execute on function public.mf_save_tx_with_goal(uuid,jsonb,jsonb,boolean) to authenticated;
