-- similar_deals_by_id_filtered — semantic neighbours with hard prefilters applied BEFORE ranking.
-- Pure vector similarity let a Ford Explorer match a Tesla Model S / Honda Civic at 81–84%. This RPC
-- restricts candidates to a price band and model-year window first, then orders by embedding
-- distance. The segment gate (truck / suv / ev / ...) is applied in the app (lib/deals/
-- similar-prefilters.ts, segmentOf) on the over-fetched rows, since segment is derived from
-- make/model there. Every filter param defaults to NULL (= no bound).
--
-- Additive and backward compatible: similar_deals_by_id (20260622030000_intelligence_v2.sql) is
-- untouched, and the app falls back to it (with the same gate in memory) until this is applied.
CREATE OR REPLACE FUNCTION public.similar_deals_by_id_filtered(
  p_deal_id   UUID,
  p_count     INT     DEFAULT 60,
  p_threshold FLOAT   DEFAULT 0.55,
  p_min_price INTEGER DEFAULT NULL,
  p_max_price INTEGER DEFAULT NULL,
  p_min_year  INTEGER DEFAULT NULL,
  p_max_year  INTEGER DEFAULT NULL
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
    AND (p_min_price IS NULL OR (d.ask_price IS NOT NULL AND d.ask_price >= p_min_price))
    AND (p_max_price IS NULL OR (d.ask_price IS NOT NULL AND d.ask_price <= p_max_price))
    AND (p_min_year  IS NULL OR (d.year IS NOT NULL AND d.year >= p_min_year))
    AND (p_max_year  IS NULL OR (d.year IS NOT NULL AND d.year <= p_max_year))
    AND 1 - (d.embedding <=> src.embedding) > p_threshold
  ORDER BY d.embedding <=> src.embedding
  LIMIT LEAST(GREATEST(p_count, 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.similar_deals_by_id_filtered(UUID, INT, FLOAT, INTEGER, INTEGER, INTEGER, INTEGER)
  TO anon, authenticated, service_role;
