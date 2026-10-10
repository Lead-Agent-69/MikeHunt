-- /api/market/timing always returned data_points: 0.
-- Cause: market_timing_signals compared ACTIVE deals by last_seen_at windows (recent 14d vs 14-30d
-- ago). Every active row is re-seen by each sweep, so last_seen_at is always recent, the "prior"
-- window is always empty, and the view returns no rows.
-- Fix: build the trend from price_history observations (one row per observed ask), joined to the
-- deal for make/model. Windows: recent = last 7 days, prior = 7-30 days ago. Rows appear once a
-- make/model has >= 5 distinct listings observed in 30 days and both windows have data (data starts
-- 2026-10-03, so the first signals show up about a week after this ships). Same columns as before,
-- so the API route is unchanged. Read-only view: no data change.

CREATE OR REPLACE VIEW public.market_timing_signals
WITH (security_invoker = true) AS
WITH obs AS (
  SELECT d.make, d.model, ph.deal_id, ph.price, ph.observed_at
  FROM public.price_history ph
  JOIN public.deals d ON d.id = ph.deal_id
  WHERE ph.price > 0
    AND d.make IS NOT NULL
    AND d.model IS NOT NULL
    AND ph.observed_at >= now() - interval '30 days'
),
windows AS (
  SELECT make,
         model,
         avg(price) FILTER (WHERE observed_at >= now() - interval '7 days') AS p_recent,
         avg(price) FILTER (WHERE observed_at < now() - interval '7 days') AS p_prior,
         count(DISTINCT deal_id) AS n
  FROM obs
  GROUP BY make, model
)
SELECT make,
       model,
       round(p_recent)::integer AS current_avg,
       round(p_prior)::integer AS prior_avg,
       round(((p_recent - p_prior) / NULLIF(p_prior, 0)) * 100, 1) AS pct_change,
       CASE
         WHEN ((p_recent - p_prior) / NULLIF(p_prior, 0)) < -0.05 THEN 'WAIT'
         WHEN ((p_recent - p_prior) / NULLIF(p_prior, 0)) > 0.05 THEN 'BUY_NOW'
         ELSE 'NEUTRAL'
       END AS signal,
       n::bigint AS data_points
FROM windows
WHERE n >= 5 AND p_prior IS NOT NULL AND p_recent IS NOT NULL;
