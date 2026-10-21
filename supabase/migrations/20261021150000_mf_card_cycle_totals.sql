-- Agregados por ciclo de fatura, calculados no servidor.
--
-- Por que: o cálculo de fatura (item 30) fazia o "caminho do FIFO" no
-- cliente — para saber o crédito antigo que abate a fatura, o app baixava
-- o histórico INTEIRO do cartão (3.365 lançamentos do Nubank) e
-- re-derivava, a cada montagem do módulo, um saldo corrente. A regra de
-- conta/fatura do app já é "cada mês se consulta sozinho, com o saldo
-- inicial = final do mês anterior" — aqui o servidor entrega o agregado
-- por ciclo (mesma matemática), e o cliente só precisa dos números.
--
-- A matemática do FIFO NÃO muda: a função devolve os mesmos agregados
-- que o cliente somava (total e estornos por ciclo, pagamento vinculado
-- e pendente por fechamento, e o pool de pagamentos históricos).
--
-- p_live: true quando o mês em tela é o mês corrente (regra do cliente:
--   pagamento vinculado conta na hora no mês vivo; em mês passado só
--   entra o que já tinha fechado ou o que já foi pago).
create or replace function public.mf_card_cycle_totals(p_ref_date date, p_live boolean default false)
returns jsonb
language sql
stable
as $$
  WITH cards AS (
    SELECT a.id, a.name, a.linked_account_id
    FROM public.mf_accounts a
    WHERE a.user_id = auth.uid() AND a.account_type = 'CARTAO'
  ),
  -- Começo do histórico: o mesmo "earliest" que o cliente calculava com
  -- as datas das transações do cartão, das transferências para ele e dos
  -- espelhos na conta vinculada (sem ele, o FIFO pararia de percorrer os
  -- ciclos antigos e o crédito antigo mudaria de valor).
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
  -- Despesas do cartão COM vínculo: o ciclo é o do invoice_close. Valem
  -- quando a data já passou OU quando o mês do lançamento é <= o mês de
  -- referência (a compra entra quando o mês chega).
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
      AND (
        t.payment_date <= p_ref_date
        OR to_char(t.payment_date, 'YYYY-MM') <= to_char(p_ref_date, 'YYYY-MM')
      )
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
