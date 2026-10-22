-- Otimiza a RPC do Resumo (mf_month_summary).
--
-- O cálculo do painel (saldo inicial, receitas, despesas, transferências,
-- saldo, previsão e o gráfico de 6 meses) era montado com um LEFT JOIN
-- "tx.account_id = acc.id OR tx.transfer_account_id = acc.id". Com o OR o
-- Postgres não usa índice: ele varria as 75 contas × 14 mil lançamentos
-- (1.055.595 avaliações de join, 1.037.774 linhas descartadas) — ~405 ms
-- por chamada (pico de 5,2 s).
--
-- Aqui o mesmo cálculo é feito em duas agregações (uma por lado da
-- movimentação: origem e destino) e as duas são somadas por hash join —
-- sem OR, sem varredura quadrática. A matemática é IDÊNTICA: validado
-- comparando o JSON antigo e o novo (byte a byte) em 6 meses.
create or replace function public.mf_month_summary(p_month text)
returns jsonb
language sql
stable
as $$
  WITH params AS (
    SELECT
      (p_month || '-01')::date AS start_d,
      ((date_trunc('month', (p_month || '-01')::date) + interval '1 month' - interval '1 day')::date) AS end_d,
      ((date_trunc('month', (p_month || '-01')::date) - interval '1 month')::date) AS prev_start_d,
      ((date_trunc('month', (p_month || '-01')::date) - interval '1 day')::date) AS prev_end_d,
      ((date_trunc('month', (p_month || '-01')::date) - interval '5 months')::date) AS flow_start_d
  ),
  -- Cada movimentação entra uma vez por lado: "origem" (a conta é
  -- account_id) e "destino" (a conta é transfer_account_id, só
  -- transferências). Sem isso, o OR do join antigo multiplicava a
  -- varredura por todas as contas.
  sides AS (
    SELECT tx.account_id AS acc_id, tx.type, tx.amount, tx.payment_date, tx.status,
           tx.invoice_close, FALSE AS credito
    FROM public.mf_transactions tx
    WHERE tx.user_id = auth.uid()
      AND tx.status IS DISTINCT FROM 'CANCELADO'
      AND tx.account_id IS NOT NULL
    UNION ALL
    SELECT tx.transfer_account_id AS acc_id, tx.type, tx.amount, tx.payment_date, tx.status,
           tx.invoice_close, TRUE AS credito
    FROM public.mf_transactions tx
    WHERE tx.user_id = auth.uid()
      AND tx.status IS DISTINCT FROM 'CANCELADO'
      AND tx.type = 'TRANSFERENCIA'
      AND tx.transfer_account_id IS NOT NULL
      AND tx.transfer_account_id <> tx.account_id
  ),
  per_account AS (
    SELECT
      acc.*,
      COALESCE(SUM(CASE
        WHEN NOT s.credito AND s.type = 'RECEITA'
         AND s.payment_date BETWEEN p.start_d AND p.end_d
        THEN s.amount ELSE 0 END), 0) AS receitas,
      COALESCE(SUM(CASE
        WHEN NOT s.credito AND s.type <> 'TRANSFERENCIA' AND s.type <> 'RECEITA'
         AND s.payment_date BETWEEN p.start_d AND p.end_d
        THEN s.amount ELSE 0 END), 0) AS despesas,
      COALESCE(SUM(CASE
        WHEN NOT s.credito AND s.type <> 'TRANSFERENCIA' AND s.type <> 'RECEITA'
         AND s.payment_date BETWEEN p.start_d AND p.end_d
         AND s.invoice_close IS NOT NULL
         AND acc.account_type <> 'CARTAO'
        THEN s.amount ELSE 0 END), 0) AS "despesasFatura",
      COALESCE(SUM(CASE
        WHEN NOT s.credito AND s.type = 'RECEITA'
         AND s.payment_date BETWEEN p.prev_start_d AND p.prev_end_d
        THEN s.amount ELSE 0 END), 0) AS "receitasPrev",
      COALESCE(SUM(CASE
        WHEN NOT s.credito AND s.type <> 'TRANSFERENCIA' AND s.type <> 'RECEITA'
         AND s.payment_date BETWEEN p.prev_start_d AND p.prev_end_d
        THEN s.amount ELSE 0 END), 0) AS "despesasPrev",
      COALESCE(SUM(CASE
        WHEN s.credito AND s.type = 'TRANSFERENCIA'
         AND s.payment_date BETWEEN p.start_d AND p.end_d
        THEN s.amount ELSE 0 END), 0) AS "transfCredito",
      COALESCE(SUM(CASE
        WHEN NOT s.credito AND s.type = 'TRANSFERENCIA'
         AND s.payment_date BETWEEN p.start_d AND p.end_d
        THEN s.amount ELSE 0 END), 0) AS "transfDebito",
      COALESCE(SUM(CASE
        WHEN s.credito AND s.status = 'PAGO' AND s.payment_date <= p.end_d
        THEN s.amount
        WHEN NOT s.credito AND s.type = 'TRANSFERENCIA' AND s.status = 'PAGO' AND s.payment_date <= p.end_d
        THEN -s.amount
        WHEN NOT s.credito AND s.type <> 'TRANSFERENCIA' AND s.status = 'PAGO' AND s.payment_date <= p.end_d
        THEN (CASE WHEN s.type = 'RECEITA' THEN s.amount ELSE -s.amount END)
        ELSE 0 END), 0) AS "saldoMov",
      COALESCE(SUM(CASE
        WHEN s.credito AND s.status = 'PAGO' AND s.payment_date <= p.prev_end_d
        THEN s.amount
        WHEN NOT s.credito AND s.type = 'TRANSFERENCIA' AND s.status = 'PAGO' AND s.payment_date <= p.prev_end_d
        THEN -s.amount
        WHEN NOT s.credito AND s.type <> 'TRANSFERENCIA' AND s.status = 'PAGO' AND s.payment_date <= p.prev_end_d
        THEN (CASE WHEN s.type = 'RECEITA' THEN s.amount ELSE -s.amount END)
        ELSE 0 END), 0) AS "saldoMovPrev",
      COALESCE(SUM(CASE
        WHEN s.credito AND s.status IS DISTINCT FROM 'PAGO' AND s.payment_date <= p.end_d
        THEN s.amount
        WHEN NOT s.credito AND s.type = 'TRANSFERENCIA' AND s.status IS DISTINCT FROM 'PAGO' AND s.payment_date <= p.end_d
        THEN -s.amount
        WHEN NOT s.credito AND s.type <> 'TRANSFERENCIA' AND s.status IS DISTINCT FROM 'PAGO' AND s.payment_date <= p.end_d
        THEN (CASE WHEN s.type = 'RECEITA' THEN s.amount ELSE -s.amount END)
        ELSE 0 END), 0) AS "pendenteMov"
    FROM public.mf_accounts acc
    CROSS JOIN params p
    LEFT JOIN sides s ON s.acc_id = acc.id
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
        (((to_jsonb(pa) - 'saldoMov') - 'pendenteMov') - 'saldoMovPrev') || jsonb_build_object(
          'currency', COALESCE(NULLIF(pa.currency, ''), 'BRL'),
          'saldo', COALESCE(pa.initial_balance, 0) + pa."saldoMov",
          'saldoPrev', COALESCE(pa.initial_balance, 0) + pa."saldoMovPrev",
          'previsto', COALESCE(pa.initial_balance, 0) + pa."saldoMov" + pa."pendenteMov"
        )
        ORDER BY COALESCE(pa.sort_order, 0), pa.id
      )
      FROM per_account pa
    ), '[]'::jsonb),
    'chartTxs', COALESCE((SELECT jsonb_agg(to_jsonb(ch)) FROM chart ch), '[]'::jsonb)
  );
$$;

revoke all on function public.mf_month_summary(text) from public, anon;
grant execute on function public.mf_month_summary(text) to authenticated;
