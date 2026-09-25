-- Geocoding: a key-less, cached place→coords store, plus the dealer's geocoded home location.
-- Enables deal coordinates (map + "near me") and saved-search radius matching.

-- 1. geocode_cache — populated lazily by lib/geo/geocode.ts. Public read so any server context can
--    reuse cached coords; writes happen via the service role in the scraper pipeline.
CREATE TABLE IF NOT EXISTS public.geocode_cache (
  place_key  TEXT PRIMARY KEY,        -- "zip:75201" or "cs:dallas|tx"
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  source     TEXT,                    -- zippopotam | census
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "geocode_cache_read" ON public.geocode_cache;
CREATE POLICY "geocode_cache_read" ON public.geocode_cache FOR SELECT USING (true);

-- 2. Dealer home coordinates (geocoded from home_zip / home city+state on profile save).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS home_lng DOUBLE PRECISION;
