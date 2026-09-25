-- Intelligence v2: semantic "similar deals" + market-timing signal.

-- 1. similar_deals_by_id — semantic nearest-neighbours for a deal via its pgvector embedding.
--    Does the source-embedding self-lookup in SQL so callers never round-trip a 768-dim vector.
--    Returns full card data + similarity. Empty when the source (or peers) lack embeddings, so the
--    API can fall back to attribute-based similarity.
CREATE OR REPLACE FUNCTION public.similar_deals_by_id(
  p_deal_id   UUID,
  p_count     INT DEFAULT 12,
  p_threshold FLOAT DEFAULT 0.55
)
RETURNS TABLE (
  id UUID, year SMALLINT, make TEXT, model TEXT, ask_price INTEGER, mileage INT,
  condition listing_condition, deal_verdict TEXT, true_net_profit NUMERIC, sell_estimate NUMERIC,
  profit_score SMALLINT, location_state CHAR(2), location_city TEXT, images TEXT[],
  source deal_source, similarity FLOAT
)
LANGUAGE sql STABLE AS $$
  SELECT d.id, d.year, d.make, d.model, d.ask_price, d.mileage, d.condition, d.deal_verdict,
         d.true_net_profit, d.sell_estimate, d.profit_score, d.location_state, d.location_city,
         d.images, d.source,
         1 - (d.embedding <=> src.embedding) AS similarity
  FROM public.deals d,
       (SELECT embedding FROM public.deals WHERE id = p_deal_id) src
  WHERE d.id <> p_deal_id
    AND d.active = true
    AND d.embedding IS NOT NULL
    AND src.embedding IS NOT NULL
    AND 1 - (d.embedding <=> src.embedding) > p_threshold
  ORDER BY d.embedding <=> src.embedding
  LIMIT p_count;
$$;

-- 2. market_timing_signals — buy-now / wait per make+model from a 14d-vs-prior-16d ask trend on the
--    live deals table (no snapshot dependency; works the day data exists). Read with security_invoker
--    so it inherits the deals "view active" RLS.
CREATE OR REPLACE VIEW public.market_timing_signals
WITH (security_invoker = true) AS
WITH windows AS (
  SELECT
    make, model,
    AVG(ask_price) FILTER (WHERE last_seen_at >= NOW() - INTERVAL '14 days')                                              AS p_recent,
    AVG(ask_price) FILTER (WHERE last_seen_at <  NOW() - INTERVAL '14 days' AND last_seen_at >= NOW() - INTERVAL '30 days') AS p_prior,
    COUNT(*)       FILTER (WHERE last_seen_at >= NOW() - INTERVAL '30 days')                                              AS n
  FROM public.deals
  WHERE active = true AND ask_price > 0 AND make IS NOT NULL AND model IS NOT NULL
  GROUP BY make, model
)
SELECT
  make, model,
  ROUND(p_recent)::INT AS current_avg,
  ROUND(p_prior)::INT  AS prior_avg,
  ROUND(((p_recent - p_prior) / NULLIF(p_prior, 0)) * 100, 1) AS pct_change,
  CASE
    WHEN (p_recent - p_prior) / NULLIF(p_prior, 0) < -0.05 THEN 'WAIT'
    WHEN (p_recent - p_prior) / NULLIF(p_prior, 0) >  0.05 THEN 'BUY_NOW'
    ELSE 'NEUTRAL'
  END AS signal,
  n AS data_points
FROM windows
WHERE n >= 5 AND p_prior IS NOT NULL AND p_recent IS NOT NULL;
