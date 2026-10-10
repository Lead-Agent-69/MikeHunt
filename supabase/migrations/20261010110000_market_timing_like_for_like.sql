-- market_timing_signals: like-for-like (same listing) instead of a cross-listing average.
-- 20261010080000 averaged every ask seen in the last 7 days against every ask seen 7-30 days ago.
-- Those are different cars each week (years, miles, trims, auction bids), so a newer, low-mile batch
-- read as a price rise (prod Ford Explorer: BUY_NOW +44.7% from 41 points).
--
-- New method (mirrors lib/market/timing.ts "same_listing"):
--   * fixed-price rows only: auction_end_at IS NULL and the source is not an auction/gov/salvage/
--     wholesale channel (bids rise by design); asks under $500 dropped (placeholder bids)
--   * a pair = a listing with an ask 7-30 days ago (baseline = its latest ask before the recent
--     window) that is still listed in the last 7 days (a newer price_history row, or last_seen_at);
--     current = its latest ask. price_history is change-logged, so an unchanged listing counts 0%.
--   * per-listing change clipped to +/-30%; pct_change = mean change
--   * a row appears only with >= 8 pairs (medium; >= 20 is high). Signal needs |pct| >= 3%.
-- Readers (ticker, analyst, dashboard summary, deal-iq, compare) keep the same columns; basis,
-- confidence and sample_size are appended. data_points is now the number of matched listings.
-- Read-only view, no data change. /api/market/timing computes in lib/market/timing.ts and does not
-- depend on this view (it also has a mix-adjusted fallback this view does not).

CREATE OR REPLACE VIEW public.market_timing_signals
WITH (security_invoker = true) AS
WITH obs AS (
  SELECT d.make, d.model, ph.deal_id, ph.price, ph.observed_at, d.last_seen_at
  FROM public.price_history ph
  JOIN public.deals d ON d.id = ph.deal_id
  WHERE ph.price >= 500
    AND d.make IS NOT NULL
    AND d.model IS NOT NULL
    AND d.auction_end_at IS NULL
    AND lower(coalesce(d.source::text, '')) !~
        '(copart|iaa|gov_auction|govdeals|public_?surplus|allsurplus|municibid|gsa|manheim|adesa|acv|auction)'
    AND ph.observed_at >= now() - interval '30 days'
),
baseline AS (
  SELECT DISTINCT ON (deal_id) deal_id, make, model, price AS base_price
  FROM obs
  WHERE observed_at < now() - interval '7 days'
  ORDER BY deal_id, observed_at DESC
),
latest AS (
  SELECT DISTINCT ON (deal_id) deal_id, price AS cur_price, observed_at, last_seen_at
  FROM obs
  ORDER BY deal_id, observed_at DESC
),
pairs AS (
  SELECT b.make, b.model, b.base_price, l.cur_price,
         greatest(-0.3, least(0.3, l.cur_price::numeric / b.base_price - 1)) AS ch
  FROM baseline b
  JOIN latest l USING (deal_id)
  WHERE l.observed_at >= now() - interval '7 days'
     OR l.last_seen_at >= now() - interval '7 days'
),
agg AS (
  SELECT make, model,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY cur_price) AS p_cur,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY base_price) AS p_base,
         avg(ch) AS mean_ch,
         count(*) AS n
  FROM pairs
  GROUP BY make, model
)
SELECT make,
       model,
       round(p_cur)::integer AS current_avg,
       round(p_base)::integer AS prior_avg,
       round(mean_ch * 100, 1) AS pct_change,
       CASE
         WHEN mean_ch <= -0.03 THEN 'WAIT'
         WHEN mean_ch >= 0.03 THEN 'BUY_NOW'
         ELSE 'NEUTRAL'
       END AS signal,
       n::bigint AS data_points,
       'same_listing'::text AS basis,
       CASE WHEN n >= 20 THEN 'high' ELSE 'medium' END::text AS confidence,
       n::integer AS sample_size
FROM agg
WHERE n >= 8;
