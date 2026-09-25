-- Fix the nightly market-intelligence aggregate so it actually accumulates a usable signal.
--
-- Two bugs made `market_aggregates` perpetually empty / useless:
--   1. It aggregated only deals last seen 30–61 days ago — a young, continuously-scraped dataset
--      never has rows in that window, so the table stayed empty (and would always lag a month).
--   2. avg_market_value = AVG(mmr_value), but the scraper pipeline never sets mmr_value (it writes
--      sell_estimate). So even populated groups had a NULL market value.
--
-- Fix: aggregate RECENT inventory (rolling 45 days) and derive the market value from
-- COALESCE(mmr_value, sell_estimate) so every analyzed deal contributes. This is the data feed the
-- valuation fallback (lib/scoring/market-value.ts → lookupMarketAggregate) reads — it now compounds
-- every night instead of staying dark.

SELECT cron.unschedule('aggregate-market-data') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aggregate-market-data');

SELECT cron.schedule('aggregate-market-data', '0 1 * * *', $$
  INSERT INTO public.market_aggregates (
    year, make, model, state, source, period,
    avg_ask, avg_market_value, avg_profit, median_odometer, unit_count
  )
  SELECT
    year, make, model, location_state as state, source,
    TO_CHAR(last_seen_at, 'YYYY-"Q"Q') as period,
    AVG(ask_price)::DECIMAL(10,2) as avg_ask,
    AVG(COALESCE(mmr_value, sell_estimate))::DECIMAL(10,2) as avg_market_value,
    AVG(true_net_profit)::DECIMAL(10,2) as avg_profit,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mileage)::INT as median_odometer,
    COUNT(*) as unit_count
  FROM public.deals
  WHERE last_seen_at >= NOW() - INTERVAL '45 days'
    AND year IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL
    AND COALESCE(mmr_value, sell_estimate) > 0
  GROUP BY year, make, model, location_state, source, TO_CHAR(last_seen_at, 'YYYY-"Q"Q')
  ON CONFLICT (year, make, model, state, source, period) DO UPDATE
  SET avg_ask = EXCLUDED.avg_ask,
      unit_count = EXCLUDED.unit_count,
      avg_market_value = EXCLUDED.avg_market_value,
      avg_profit = EXCLUDED.avg_profit;
$$);
