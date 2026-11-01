-- Extrato: mes da fatura usa o dia efetivo do fechamento quando o cartao
-- tem closing_dynamic (o fechamento pode ter atravessado o mes).
-- Sem a flag, mantem a regra historica (due_day >= closing_day).

-- =============================================================
-- Minhas Finanças — extrato do mês agregado no servidor (RPC).
--
-- MOTIVO: a tela de Extrato (todas as contas) baixava as ~13 mil
-- linhas para montar grupos por dia + saldo corrente no cliente.
-- Esta function devolve só o mês (+ abertura) — mesmo formato
-- { groups, opening } do computeStatement, telas intactas.
--
-- Semântica idêntica ao computeStatement:
--   - escopo = contas pedidas (origem OU destino da transferência);
--   - despesa de cartão com fatura escolhida vale o mês do VENCIMENTO
--     (D >= C → mesmo mês, senão +1), como cardExpenseMonth;
--   - sem vínculo, vale a data (janela [start,end] inclusive);
--   - abertura = iniciais do escopo + PAGO com mês < visto
--     (transferência conta mesmo fora do escopo da linha? não:
--     só entra se uma ponta está no escopo — igual ao scopeDelta);
--   - saldo corrente acumula só PAGO, na ordem
--     (payment_date, created_at, id).
-- Segurança: SECURITY INVOKER + filtro explícito auth.uid();
-- EXECUTE só para authenticated.
-- =============================================================

CREATE OR REPLACE FUNCTION public.mf_statement(
  p_month text,
  p_account_ids uuid[] DEFAULT NULL,
  p_profile_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      (p_month || '-01')::date AS start_d,
      ((date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day')::date) AS end_d,
      p_month AS view_m,
      COALESCE(p_account_ids IS NOT NULL
       AND array_length(p_account_ids, 1) = 1
       AND EXISTS (SELECT 1 FROM public.mf_accounts a
                   WHERE a.id = p_account_ids[1]
                     AND a.user_id = auth.uid()
                     AND a.account_type = 'CARTAO'), FALSE) AS is_card
  ),
  named AS (
    SELECT acc.id, acc.name, acc.currency, acc.account_type,
           acc.closing_day, acc.due_day, acc.closing_dynamic
    FROM public.mf_accounts acc
    WHERE acc.user_id = auth.uid()
      AND (p_profile_id IS NULL OR acc.profile_id = p_profile_id)
  ),
  scoped AS (
    SELECT n.id FROM named n
    WHERE (p_account_ids IS NULL OR n.id = ANY(p_account_ids))
  ),
  cardmonth AS (
    SELECT
      tx.*,
      CASE
        WHEN tx.type = 'DESPESA' AND tx.invoice_close IS NOT NULL AND o.account_type = 'CARTAO'
        THEN to_char(((date_trunc('month', tx.invoice_close) + (CASE WHEN COALESCE(o.due_day, 10) >= (CASE WHEN COALESCE(o.closing_dynamic, false) THEN EXTRACT(DAY FROM tx.invoice_close) ELSE COALESCE(o.closing_day, 1) END) THEN interval '0' ELSE interval '1 month' END))::date), 'YYYY-MM')
        ELSE to_char(tx.payment_date, 'YYYY-MM')
      END AS cmonth,
      o.name AS owner_name,
      o.currency AS owner_currency
    FROM public.mf_transactions tx
    LEFT JOIN named o ON o.id = tx.account_id
    WHERE tx.user_id = auth.uid()
      AND tx.status IS DISTINCT FROM 'CANCELADO'
      AND (tx.account_id IN (SELECT id FROM scoped)
        OR tx.transfer_account_id IN (SELECT id FROM scoped))
  ),
  opening_val AS (
    SELECT
      (SELECT COALESCE(SUM(s0.initial_balance), 0) FROM public.mf_accounts s0
        WHERE s0.id IN (SELECT id FROM scoped)) +
      COALESCE(SUM(
        CASE WHEN cm.status = 'PAGO'
              AND NOT (fl.is_card AND cm.type = 'TRANSFERENCIA')
              AND cm.cmonth < (SELECT p.view_m FROM params p)
             THEN (CASE WHEN cm.type = 'TRANSFERENCIA'
                        THEN (CASE WHEN cm.account_id IN (SELECT id FROM scoped) THEN -cm.amount ELSE 0 END)
                           + (CASE WHEN cm.transfer_account_id IN (SELECT id FROM scoped) THEN cm.amount ELSE 0 END)
                        WHEN cm.account_id IN (SELECT id FROM scoped)
                        THEN (CASE WHEN cm.type = 'RECEITA' THEN cm.amount ELSE -cm.amount END)
                        ELSE 0 END)
             ELSE 0 END), 0) AS opening
    FROM cardmonth cm CROSS JOIN (SELECT is_card FROM params) fl
  ),
  month_rows AS (
    SELECT cm.*,
      CASE WHEN cm.status = 'PAGO'
           THEN (CASE WHEN cm.type = 'TRANSFERENCIA'
                      THEN (CASE WHEN cm.account_id IN (SELECT id FROM scoped) THEN -cm.amount ELSE 0 END)
                         + (CASE WHEN cm.transfer_account_id IN (SELECT id FROM scoped) THEN cm.amount ELSE 0 END)
                      WHEN cm.account_id IN (SELECT id FROM scoped)
                      THEN (CASE WHEN cm.type = 'RECEITA' THEN cm.amount ELSE -cm.amount END)
                      ELSE 0 END)
           ELSE 0 END AS disp_delta
    FROM cardmonth cm
    CROSS JOIN params p
    WHERE NOT (p.is_card AND cm.type = 'TRANSFERENCIA')
      AND ((cm.type = 'DESPESA' AND cm.invoice_close IS NOT NULL AND cm.cmonth = p.view_m)
        OR ((cm.type <> 'DESPESA' OR cm.invoice_close IS NULL)
            AND cm.payment_date BETWEEN p.start_d AND p.end_d))
  ),
  items AS (
    SELECT mr.*,
      (SELECT o.opening FROM opening_val o) +
        COALESCE(SUM(CASE WHEN mr.status = 'PAGO' THEN mr.disp_delta ELSE 0 END)
          OVER (ORDER BY mr.payment_date, mr.created_at, mr.id
                ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0) AS balance
    FROM month_rows mr
  )
  SELECT jsonb_build_object(
    'opening', (SELECT opening FROM opening_val),
    'groups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('date', g.payment_date, 'items', g.items)
        ORDER BY g.payment_date)
      FROM (
        SELECT it.payment_date,
          jsonb_agg(
            jsonb_build_object(
              'tx', (to_jsonb(it) - 'cmonth' - 'owner_name' - 'owner_currency' - 'disp_delta' - 'balance'),
              'delta', it.disp_delta,
              'accountName', COALESCE(it.owner_name, '—'),
              'transferAccountName', CASE WHEN it.type = 'TRANSFERENCIA'
                THEN (SELECT COALESCE(n2.name, '—') FROM public.mf_accounts n2
                      WHERE n2.id = it.transfer_account_id AND n2.user_id = auth.uid()
                        AND (p_profile_id IS NULL OR n2.profile_id = p_profile_id))
                ELSE NULL END,
              'balance', it.balance,
              'currency', COALESCE(NULLIF(it.owner_currency, ''), 'BRL'))
            ORDER BY it.payment_date, it.created_at, it.id) AS items
        FROM items it GROUP BY it.payment_date
      ) g
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.mf_statement(text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mf_statement(text, uuid[], uuid) TO authenticated;
