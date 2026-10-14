-- =============================================================
-- Minhas Finanças — resumo do mês agregado no servidor (RPC).
--
-- MOTIVO (medido em produção 14/10/2026): 13.715 lançamentos (~5 MB).
-- Cada ação no módulo recarregava a tabela inteira 3x
-- (month-summary + all-transactions + statement ≈ 15 MB) porque os
-- saldos correntes exigem o histórico completo. Esta function soma no
-- Postgres e devolve ~100 linhas — mesmo formato JSON que o cálculo
-- client-side ({ rows, chartTxs }), então telas e testes não mudam.
--
-- Semântica idêntica a computeAccountRows/useMFMonthSummary:
--   - janelas [start,end] do mês e do mês anterior (inclusive);
--   - TRANSFERENCIA só move transfCredito/transfDebito e saldos;
--   - não-RECEITA conta como despesa (espelha o ELSE do JS);
--   - status: só 'PAGO' entra no saldo; resto vai ao pendente;
--   - CANCELADO sempre fora; sem recorte por perfil (o hook filtra).
-- Segurança: SECURITY INVOKER + filtro explícito auth.uid() em
-- contas e lançamentos; EXECUTE só para authenticated.
-- =============================================================

CREATE OR REPLACE FUNCTION public.mf_month_summary(p_month text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      (p_month || '-01')::date AS start_d,
      ((date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day')::date) AS end_d,
      ((date_trunc('month', (p_month || '-01')::date) - interval '1 month')::date) AS prev_start_d,
      ((date_trunc('month', (p_month || '-01')::date) - interval '1 day')::date) AS prev_end_d,
      ((date_trunc('month', (p_month || '-01')::date) - interval '5 months')::date) AS flow_start_d
  ),
  per_account AS (
    SELECT
      acc.*,
      COALESCE(SUM(CASE
        WHEN tx.type = 'RECEITA' AND tx.account_id = acc.id
         AND tx.payment_date BETWEEN p.start_d AND p.end_d
        THEN tx.amount ELSE 0 END), 0) AS receitas,
      COALESCE(SUM(CASE
        WHEN tx.type <> 'TRANSFERENCIA' AND tx.type <> 'RECEITA'
         AND tx.account_id = acc.id
         AND tx.payment_date BETWEEN p.start_d AND p.end_d
        THEN tx.amount ELSE 0 END), 0) AS despesas,
      COALESCE(SUM(CASE
        WHEN tx.type = 'RECEITA' AND tx.account_id = acc.id
         AND tx.payment_date BETWEEN p.prev_start_d AND p.prev_end_d
        THEN tx.amount ELSE 0 END), 0) AS "receitasPrev",
      COALESCE(SUM(CASE
        WHEN tx.type <> 'TRANSFERENCIA' AND tx.type <> 'RECEITA'
         AND tx.account_id = acc.id
         AND tx.payment_date BETWEEN p.prev_start_d AND p.prev_end_d
        THEN tx.amount ELSE 0 END), 0) AS "despesasPrev",
      COALESCE(SUM(CASE
        WHEN tx.type = 'TRANSFERENCIA' AND tx.transfer_account_id = acc.id
         AND tx.payment_date BETWEEN p.start_d AND p.end_d
        THEN tx.amount ELSE 0 END), 0) AS "transfCredito",
      COALESCE(SUM(CASE
        WHEN tx.type = 'TRANSFERENCIA' AND tx.account_id = acc.id
         AND tx.payment_date BETWEEN p.start_d AND p.end_d
        THEN tx.amount ELSE 0 END), 0) AS "transfDebito",
      COALESCE(SUM(CASE
        WHEN tx.type = 'TRANSFERENCIA' AND tx.account_id = acc.id
         AND tx.payment_date <= p.end_d AND tx.status = 'PAGO'
        THEN -tx.amount
        WHEN tx.type = 'TRANSFERENCIA' AND tx.transfer_account_id = acc.id
         AND tx.payment_date <= p.end_d AND tx.status = 'PAGO'
        THEN tx.amount
        WHEN tx.type <> 'TRANSFERENCIA' AND tx.account_id = acc.id
         AND tx.payment_date <= p.end_d AND tx.status = 'PAGO'
        THEN (CASE WHEN tx.type = 'RECEITA' THEN tx.amount ELSE -tx.amount END)
        ELSE 0 END), 0) AS "saldoMov",
      COALESCE(SUM(CASE
        WHEN tx.type = 'TRANSFERENCIA' AND tx.account_id = acc.id
         AND tx.payment_date <= p.end_d AND tx.status IS DISTINCT FROM 'PAGO'
        THEN -tx.amount
        WHEN tx.type = 'TRANSFERENCIA' AND tx.transfer_account_id = acc.id
         AND tx.payment_date <= p.end_d AND tx.status IS DISTINCT FROM 'PAGO'
        THEN tx.amount
        WHEN tx.type <> 'TRANSFERENCIA' AND tx.account_id = acc.id
         AND tx.payment_date <= p.end_d AND tx.status IS DISTINCT FROM 'PAGO'
        THEN (CASE WHEN tx.type = 'RECEITA' THEN tx.amount ELSE -tx.amount END)
        ELSE 0 END), 0) AS "pendenteMov"
    FROM public.mf_accounts acc
    CROSS JOIN params p
    LEFT JOIN public.mf_transactions tx
      ON (tx.account_id = acc.id OR tx.transfer_account_id = acc.id)
      AND tx.user_id = auth.uid()
      AND tx.status IS DISTINCT FROM 'CANCELADO'
    WHERE acc.user_id = auth.uid()
    GROUP BY acc.id
  ),
  chart AS (
    SELECT
      to_char(tx.payment_date, 'YYYY-MM') AS m,
      tx.account_id AS a,
      COALESCE(NULLIF(owner.currency, ''), 'BRL') AS c,
      tx.type AS t,
      tx.amount AS v,
      tx.category_id AS cat
    FROM public.mf_transactions tx
    JOIN public.mf_accounts owner
      ON owner.id = tx.account_id AND owner.user_id = auth.uid()
    CROSS JOIN params p
    WHERE tx.user_id = auth.uid()
      AND tx.status = 'PAGO'
      AND tx.type IN ('RECEITA', 'DESPESA')
      AND tx.payment_date BETWEEN p.flow_start_d AND p.end_d
    ORDER BY tx.payment_date, tx.id
  )
  SELECT jsonb_build_object(
    'rows', COALESCE((
      SELECT jsonb_agg(
        ((to_jsonb(pa) - 'saldoMov') - 'pendenteMov') || jsonb_build_object(
          'currency', COALESCE(NULLIF(pa.currency, ''), 'BRL'),
          'saldo', COALESCE(pa.initial_balance, 0) + pa."saldoMov",
          'previsto', COALESCE(pa.initial_balance, 0) + pa."saldoMov" + pa."pendenteMov"
        )
        ORDER BY COALESCE(pa.sort_order, 0), pa.id
      )
      FROM per_account pa
    ), '[]'::jsonb),
    'chartTxs', COALESCE((SELECT jsonb_agg(to_jsonb(ch)) FROM chart ch), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.mf_month_summary(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mf_month_summary(text) TO authenticated;
