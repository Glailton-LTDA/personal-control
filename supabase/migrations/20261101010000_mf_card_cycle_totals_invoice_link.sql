-- Fatura estável: compra com vínculo (`invoice_close`) pertence àquela
-- fatura, independentemente do mês que está aberto na tela.
--
-- Antes o agregado de despesas vinculadas cortava por data:
--   payment_date <= p_ref_date OR mês(payment_date) <= mês(p_ref_date)
-- Então uma parcela com data em dezembro vinculada à fatura de novembro só
-- entrava no total quando o mês de dezembro era aberto — a fatura de
-- novembro mudava de valor ao navegar. Agora o vínculo manda: o ciclo é o
-- `invoice_close`, sem janela de data. A despesa sem vínculo (legado)
-- continua cortada pela data de referência.
create or replace function public.mf_card_cycle_totals(p_ref_date date, p_live boolean default false)
returns jsonb
language sql
stable
as $$
  -- `p_live` continua no contrato por compatibilidade (o pagamento
  -- vinculado usa a mesma régua de época); a despesa vinculada não usa
  -- mais o mês da data.
  WITH cards AS (
    SELECT a.id, a.name, a.linked_account_id
    FROM public.mf_accounts a
    WHERE a.user_id = auth.uid() AND a.account_type = 'CARTAO'
  ),
  first_dates AS (
    SELECT c.id AS card_id,
           MIN(d) AS first_date
    FROM cards c
    CROSS JOIN LATERAL (
      SELECT MIN(t.payment_date) AS d
      FROM public.mf_transactions t
      WHERE t.user_id = auth.uid()
        AND (t.account_id = c.id
             OR t.transfer_account_id = c.id
             OR t.account_id = c.linked_account_id)
    ) x
    GROUP BY c.id
  ),
  -- Despesas do cartão SEM vínculo de fatura: o ciclo é o do mês do
  -- vencimento, que é o mês da data do lançamento.
  unbound AS (
    SELECT t.account_id AS card_id,
           to_char(t.payment_date, 'YYYY-MM') AS ym,
           SUM(t.amount) AS total,
           SUM(LEAST(t.amount, 0)) AS refunds,
           COUNT(*) AS n
    FROM public.mf_transactions t
    JOIN cards c ON c.id = t.account_id
    WHERE t.user_id = auth.uid()
      AND t.type = 'DESPESA'
      AND t.status IS DISTINCT FROM 'CANCELADO'
      AND t.invoice_close IS NULL
      AND t.payment_date <= p_ref_date
    GROUP BY 1, 2
  ),
  -- Despesas do cartão COM vínculo: o ciclo é o do invoice_close. O
  -- vínculo é a fonte da verdade — não há corte por data (era o que fazia
  -- a mesma fatura mudar ao abrir um mês posterior).
  bound_exp AS (
    SELECT t.account_id AS card_id,
           t.invoice_close::text AS close_iso,
           SUM(t.amount) AS total,
           SUM(LEAST(t.amount, 0)) AS refunds,
           COUNT(*) AS n
    FROM public.mf_transactions t
    JOIN cards c ON c.id = t.account_id
    WHERE t.user_id = auth.uid()
      AND t.type = 'DESPESA'
      AND t.status IS DISTINCT FROM 'CANCELADO'
      AND t.invoice_close IS NOT NULL
    GROUP BY 1, 2
  ),
  -- Pool do FIFO: transferências para o cartão SEM vínculo (os
  -- pagamentos históricos importados).
  pool AS (
    SELECT t.transfer_account_id AS card_id,
           SUM(t.amount) AS pool,
           COUNT(*) AS n
    FROM public.mf_transactions t
    JOIN cards c ON c.id = t.transfer_account_id
    WHERE t.user_id = auth.uid()
      AND t.type = 'TRANSFERENCIA'
      AND t.invoice_close IS NULL
      AND t.status IS DISTINCT FROM 'CANCELADO'
      AND t.payment_date <= p_ref_date
    GROUP BY 1
  ),
  -- Pagamento vinculado por fechamento: o espelho na conta vinculada
  -- (DESPESA com invoice_close) ou a transferência legada com vínculo.
  bound_pay AS (
    SELECT c.id AS card_id,
           t.invoice_close::text AS close_iso,
           SUM(t.amount) AS raw_bound,
           SUM(CASE WHEN t.status = 'PENDENTE' THEN t.amount ELSE 0 END) AS pending_bound,
           COUNT(*) AS n
    FROM public.mf_transactions t
    JOIN cards c ON c.linked_account_id = t.account_id
    WHERE t.user_id = auth.uid()
      AND t.invoice_close IS NOT NULL
      AND t.status IS DISTINCT FROM 'CANCELADO'
      AND (
        t.type = 'DESPESA'
        OR (t.type = 'TRANSFERENCIA' AND t.transfer_account_id = c.id)
      )
      AND (
        p_live
        OR t.invoice_close <= p_ref_date
        OR (t.status = 'PAGO' AND t.payment_date <= p_ref_date)
      )
    GROUP BY 1, 2
  )
  SELECT jsonb_build_object(
    'card_id', c.id,
    'name', c.name,
    'pool', COALESCE(p.pool, 0),
    'firstDate', f.first_date,
    'months', COALESCE((
      SELECT jsonb_object_agg(
        u.ym,
        jsonb_build_object('total', u.total, 'refunds', -u.refunds, 'n', u.n)
      )
      FROM unbound u WHERE u.card_id = c.id
    ), '{}'::jsonb),
    'closes', COALESCE((
      SELECT jsonb_object_agg(
        b.close_iso,
        jsonb_build_object('total', b.total, 'refunds', -b.refunds, 'n', b.n)
      )
      FROM bound_exp b WHERE b.card_id = c.id
    ), '{}'::jsonb),
    'payments', COALESCE((
      SELECT jsonb_object_agg(
        bp.close_iso,
        jsonb_build_object('rawBound', bp.raw_bound, 'pendingBound', bp.pending_bound, 'n', bp.n)
      )
      FROM bound_pay bp WHERE bp.card_id = c.id
    ), '{}'::jsonb)
  )
  FROM cards c
  LEFT JOIN pool p ON p.card_id = c.id
  LEFT JOIN first_dates f ON f.card_id = c.id
  ORDER BY c.name;
$$;

revoke all on function public.mf_card_cycle_totals(date, boolean) from public, anon;
grant execute on function public.mf_card_cycle_totals(date, boolean) to authenticated;
