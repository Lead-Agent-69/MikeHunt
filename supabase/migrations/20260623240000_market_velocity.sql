-- Phase C: listing velocity (days-on-market) learned from our OWN scrape history — no paid data.
-- The nightly market aggregate already rolls up ask/value/profit per make/model/state/source; this
-- adds avg_days_listed = average time a unit has been listed (first_seen_at -> last_seen_at), so the
-- platform can surface "these F-150s sit ~12 days" as a real demand/velocity + negotiation signal.
-- Also adds a cheap guard so junk "makes" that lead with a digit ("2024", "2018" — year leaked into
-- the make field) never form aggregate rows, and backfills immediately so the column isn't NULL
-- until the first 1 AM run.
--
-- NOTE: sold_listings is intentionally left EMPTY. The only honest source of real SALE prices is
-- deal_outcomes.sell_price (logged by dealers). We do NOT fabricate sold prices from delisted
-- asking prices — that would be fake data.

SELECT cron.unschedule('aggregate-market-data') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aggregate-market-data');

SELECT cron.schedule('aggregate-market-data', '0 1 * * *', $$
  INSERT INTO public.market_aggregates (
    year, make, model, state, source, period,
    avg_ask, avg_market_value, avg_profit, median_odometer, unit_count, avg_days_listed
  )
  SELECT
    year, make, model, location_state as state, source,
    TO_CHAR(last_seen_at, 'YYYY-"Q"Q') as period,
    AVG(ask_price)::DECIMAL(10,2),
    AVG(COALESCE(mmr_value, sell_estimate))::DECIMAL(10,2),
    AVG(true_net_profit)::DECIMAL(10,2),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mileage)::INT,
    COUNT(*),
    AVG(GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - first_seen_at)) / 86400.0))::INT
  FROM public.deals
  WHERE last_seen_at >= NOW() - INTERVAL '45 days'
    AND year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL
    AND make !~ '^\s*[0-9]'
    AND COALESCE(mmr_value, sell_estimate) > 0
  GROUP BY year, make, model, location_state, source, TO_CHAR(last_seen_at, 'YYYY-"Q"Q')
  ON CONFLICT (year, make, model, state, source, period) DO UPDATE
  SET avg_ask = EXCLUDED.avg_ask,
      unit_count = EXCLUDED.unit_count,
      avg_market_value = EXCLUDED.avg_market_value,
      avg_profit = EXCLUDED.avg_profit,
      avg_days_listed = EXCLUDED.avg_days_listed;
$$);

-- Immediate backfill (same SELECT) so avg_days_listed is populated now, not a month from now.
INSERT INTO public.market_aggregates (
  year, make, model, state, source, period,
  avg_ask, avg_market_value, avg_profit, median_odometer, unit_count, avg_days_listed
)
SELECT
  year, make, model, location_state as state, source,
  TO_CHAR(last_seen_at, 'YYYY-"Q"Q') as period,
  AVG(ask_price)::DECIMAL(10,2),
  AVG(COALESCE(mmr_value, sell_estimate))::DECIMAL(10,2),
  AVG(true_net_profit)::DECIMAL(10,2),
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mileage)::INT,
  COUNT(*),
  AVG(GREATEST(0, EXTRACT(EPOCH FROM (last_seen_at - first_seen_at)) / 86400.0))::INT
FROM public.deals
WHERE last_seen_at >= NOW() - INTERVAL '45 days'
  AND year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL
  AND make !~ '^\s*[0-9]'
  AND COALESCE(mmr_value, sell_estimate) > 0
GROUP BY year, make, model, location_state, source, TO_CHAR(last_seen_at, 'YYYY-"Q"Q')
ON CONFLICT (year, make, model, state, source, period) DO UPDATE
SET avg_days_listed = EXCLUDED.avg_days_listed,
    avg_ask = EXCLUDED.avg_ask,
    unit_count = EXCLUDED.unit_count,
    avg_market_value = EXCLUDED.avg_market_value,
    avg_profit = EXCLUDED.avg_profit;
