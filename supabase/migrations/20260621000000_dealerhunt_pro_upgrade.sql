-- Supabase Migration: DealerHunt Pro Upgrade
-- Aligns with the 'deals' table naming (renamed from vehicles/listings)

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Create user_profiles table (extends auth.users for non-dealer users)
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  user_type TEXT DEFAULT 'buyer' CHECK (user_type IN ('dealer','buyer','mechanic','investor')),
  home_state TEXT,
  home_zip TEXT,
  budget_min DECIMAL DEFAULT 0,
  budget_max DECIMAL DEFAULT 100000,
  preferred_makes TEXT[] DEFAULT '{}',
  preferred_body_styles TEXT[] DEFAULT '{}',
  max_odometer INT DEFAULT 150000,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create saved_cars table (universal watchlists for users/dealers)
CREATE TABLE IF NOT EXISTS public.saved_cars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dealer_id UUID REFERENCES public.dealers(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  snapshot JSONB NOT NULL,
  source_url TEXT,
  source_name TEXT,
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT DEFAULT 'active' CHECK (
    status IN ('active','price_drop','price_increase','ending_soon','unavailable','acquired','watching','passed','archived')
  ),
  price_at_save DECIMAL,
  last_price_seen DECIMAL,
  market_value_at_save DECIMAL,
  profit_at_save DECIMAL,
  saved_at TIMESTAMPTZ DEFAULT NOW(),
  last_checked TIMESTAMPTZ DEFAULT NOW(),
  notified_unavailable BOOLEAN DEFAULT FALSE,
  CONSTRAINT uq_user_url UNIQUE(user_id, source_url)
);

CREATE INDEX IF NOT EXISTS idx_saved_cars_user_status ON public.saved_cars(user_id, status);
CREATE INDEX IF NOT EXISTS idx_saved_cars_deal_id ON public.saved_cars(deal_id);
CREATE INDEX IF NOT EXISTS idx_saved_cars_source_url ON public.saved_cars(source_url);

-- 3. Create vin_price_history table (for vehicle price trend tracking)
CREATE TABLE IF NOT EXISTS public.vin_price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin TEXT NOT NULL,
  asking_price DECIMAL,
  market_value DECIMAL,
  source TEXT,
  location_state TEXT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vin_price_history_vin ON public.vin_price_history(vin, recorded_at DESC);

-- 4. Create market_aggregates table (for historical analytics and market intelligence)
CREATE TABLE IF NOT EXISTS public.market_aggregates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INT,
  make TEXT,
  model TEXT,
  trim TEXT,
  state TEXT,
  source TEXT,
  category TEXT,
  period TEXT, -- Format: '2026-Q2'
  avg_ask DECIMAL,
  median_ask DECIMAL,
  avg_market_value DECIMAL,
  avg_profit DECIMAL,
  median_odometer INT,
  unit_count INT,
  avg_days_listed INT,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(year, make, model, state, source, period)
);

CREATE INDEX IF NOT EXISTS idx_market_aggregates_search ON public.market_aggregates(make, model, state);

-- 5. Create source_url_cache table (for save-from-anywhere URL indexing)
CREATE TABLE IF NOT EXISTS public.source_url_cache (
  url_hash TEXT PRIMARY KEY, -- MD5 hash of URL
  url TEXT NOT NULL,
  source TEXT,
  deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_cars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vin_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_aggregates ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies
CREATE POLICY "own_profile" ON public.user_profiles FOR ALL USING (id = auth.uid());
CREATE POLICY "own_saved" ON public.saved_cars FOR ALL USING (user_id = auth.uid());

CREATE POLICY "own_vin_history" ON public.vin_price_history FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.saved_cars sc 
    WHERE sc.user_id = auth.uid() 
      AND sc.snapshot->>'vin' = public.vin_price_history.vin
  )
);
CREATE POLICY "vin_history_insert" ON public.vin_price_history FOR INSERT WITH CHECK (true);

CREATE POLICY "aggregates_public" ON public.market_aggregates FOR SELECT USING (true);

-- 8. Schedule pg_cron jobs for retention and aggregates
-- Ensure we unschedule existing jobs first to prevent duplicates during testing/migrations
SELECT cron.unschedule('cleanup-expired-deals') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-deals');
SELECT cron.unschedule('aggregate-market-data') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aggregate-market-data');

-- Nightly deal retention cleanup (runs at 2:00 AM daily)
-- Moves old/unsaved deals to active = false, and hard deletes after 60 days
SELECT cron.schedule('cleanup-expired-deals', '0 2 * * *', $$
  -- Mark active = false for deals older than 30 days that are not saved by users
  UPDATE public.deals SET active = false
  WHERE scraped_at < NOW() - INTERVAL '30 days'
    AND id NOT IN (SELECT deal_id FROM public.saved_cars WHERE deal_id IS NOT NULL)
    AND id NOT IN (SELECT deal_id FROM public.watchlist WHERE deal_id IS NOT NULL);

  -- Hard delete inactive deals older than 60 days that are not saved by users
  DELETE FROM public.deals
  WHERE active = false
    AND scraped_at < NOW() - INTERVAL '60 days'
    AND id NOT IN (SELECT deal_id FROM public.saved_cars WHERE deal_id IS NOT NULL);
  
  -- Clean up expired url caches
  DELETE FROM public.source_url_cache WHERE expires_at < NOW();
  
  -- Clean up old VIN history older than 180 days
  DELETE FROM public.vin_price_history WHERE recorded_at < NOW() - INTERVAL '180 days';
$$);

-- Nightly market data aggregation (runs at 1:00 AM daily)
-- Aggregates pricing data for historical lookup
SELECT cron.schedule('aggregate-market-data', '0 1 * * *', $$
  INSERT INTO public.market_aggregates (
    year, make, model, state, source, period, 
    avg_ask, avg_market_value, avg_profit, median_odometer, unit_count
  )
  SELECT 
    year, 
    make, 
    model, 
    location_state as state, 
    source,
    TO_CHAR(scraped_at, 'YYYY-"Q"Q') as period,
    AVG(ask_price)::DECIMAL(10,2) as avg_ask,
    AVG(mmr_value)::DECIMAL(10,2) as avg_market_value,
    AVG(profit_estimate)::DECIMAL(10,2) as avg_profit,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY mileage)::INT as median_odometer,
    COUNT(*) as unit_count
  FROM public.deals
  WHERE scraped_at BETWEEN NOW() - INTERVAL '61 days' AND NOW() - INTERVAL '30 days'
    AND year IS NOT NULL 
    AND make IS NOT NULL
  GROUP BY year, make, model, location_state, source, TO_CHAR(scraped_at, 'YYYY-"Q"Q')
  ON CONFLICT (year, make, model, state, source, period) DO UPDATE
  SET avg_ask = EXCLUDED.avg_ask, 
      unit_count = EXCLUDED.unit_count,
      avg_market_value = EXCLUDED.avg_market_value,
      avg_profit = EXCLUDED.avg_profit;
$$);
