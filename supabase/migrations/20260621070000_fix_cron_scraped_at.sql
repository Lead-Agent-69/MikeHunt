-- Fix nightly cron jobs that referenced deals.scraped_at (which doesn't exist on public.deals;
-- the real recency column is last_seen_at). Both jobs were erroring every night → no retention
-- cleanup and no market aggregation. Reschedule them against last_seen_at.

SELECT cron.unschedule('cleanup-expired-deals') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-deals');
SELECT cron.unschedule('aggregate-market-data') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aggregate-market-data');

SELECT cron.schedule('cleanup-expired-deals', '0 2 * * *', $$
  UPDATE public.deals SET active = false
  WHERE last_seen_at < NOW() - INTERVAL '30 days'
    AND id NOT IN (SELECT deal_id FROM public.saved_cars WHERE deal_id IS NOT NULL)
    AND id NOT IN (SELECT deal_id FROM public.watchlist WHERE deal_id IS NOT NULL);

  DELETE FROM public.deals
  WHERE active = false
    AND last_seen_at < NOW() - INTERVAL '60 days'
    AND id NOT IN (SELECT deal_id FROM public.saved_cars WHERE deal_id IS NOT NULL);

  DELETE FROM public.source_url_cache WHERE expires_at < NOW();
  DELETE FROM public.vin_price_history WHERE recorded_at < NOW() - INTERVAL '180 days';
$$);

SELECT cron.schedule('aggregate-market-data', '0 1 * * *', $$
  INSERT INTO public.market_aggregates (
    year, make, model, state, source, period,
    avg_ask, avg_market_value, avg_profit, median_odometer, unit_count
  )
  SELECT
    year, make, model, location_state as state, source,
    TO_CHAR(last_seen_at, 'YYYY-"Q"Q') as period,
    AVG(ask_price)::DECIMAL(10,2) as avg_ask,
    AVG(mmr_value)::DECIMAL(10,2) as avg_market_value,
    AVG(true_net_profit)::DECIMAL(10,2) as avg_profit,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mileage)::INT as median_odometer,
    COUNT(*) as unit_count
  FROM public.deals
  WHERE last_seen_at BETWEEN NOW() - INTERVAL '61 days' AND NOW() - INTERVAL '30 days'
    AND year IS NOT NULL AND make IS NOT NULL
  GROUP BY year, make, model, location_state, source, TO_CHAR(last_seen_at, 'YYYY-"Q"Q')
  ON CONFLICT (year, make, model, state, source, period) DO UPDATE
  SET avg_ask = EXCLUDED.avg_ask,
      unit_count = EXCLUDED.unit_count,
      avg_market_value = EXCLUDED.avg_market_value,
      avg_profit = EXCLUDED.avg_profit;
$$);
