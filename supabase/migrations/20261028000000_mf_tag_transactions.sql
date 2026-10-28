-- -------------------------------------------------------------
-- Lançamentos de uma tag (Ajustes → Tags), paginados e filtrados no
-- servidor: devolve a página, o total de lançamentos, a soma por moeda e
-- os anos com movimento — sem baixar o histórico inteiro da tag.
--
-- Filtros: p_from/p_to (datas inclusivas), p_search (descrição, ilike).
-- SECURITY INVOKER: as policies de mf_transactions/mf_transaction_tags/
-- mf_accounts valem normalmente.
-- -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mf_tag_transactions(
  p_tag_id UUID,
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
) RETURNS JSONB
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT
      t.id,
      t.description,
      t.amount,
      t.payment_date,
      t.account_id,
      t.status,
      t.type,
      COALESCE(a.currency, 'BRL') AS currency
    FROM public.mf_transactions t
    JOIN public.mf_transaction_tags l ON l.transaction_id = t.id
    LEFT JOIN public.mf_accounts a ON a.id = t.account_id
    WHERE l.tag_id = p_tag_id
      AND (p_from IS NULL OR t.payment_date >= p_from)
      AND (p_to IS NULL OR t.payment_date <= p_to)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        OR t.description ILIKE '%' || p_search || '%'
      )
  ),
  page AS (
    SELECT *
    FROM filtered
    ORDER BY payment_date DESC NULLS LAST, id DESC
    LIMIT GREATEST(0, p_limit)
    OFFSET GREATEST(0, p_offset)
  ),
  years AS (
    SELECT DISTINCT EXTRACT(YEAR FROM t.payment_date)::INT AS year
    FROM public.mf_transactions t
    JOIN public.mf_transaction_tags l ON l.transaction_id = t.id
    WHERE l.tag_id = p_tag_id AND t.payment_date IS NOT NULL
    ORDER BY year DESC
  )
  SELECT jsonb_build_object(
    'rows', COALESCE(
      (SELECT jsonb_agg(to_jsonb(p)) FROM page p),
      '[]'::jsonb
    ),
    'total', (SELECT count(*) FROM filtered),
    'amounts', COALESCE(
      (
        SELECT jsonb_object_agg(currency, total)
        FROM (
          SELECT currency, sum(amount) AS total
          FROM filtered
          GROUP BY currency
        ) x
      ),
      '{}'::jsonb
    ),
    'years', COALESCE(
      (SELECT jsonb_agg(year) FROM years),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.mf_tag_transactions(UUID, DATE, DATE, TEXT, INT, INT)
  FROM public;
GRANT EXECUTE ON FUNCTION public.mf_tag_transactions(UUID, DATE, DATE, TEXT, INT, INT)
  TO authenticated;
