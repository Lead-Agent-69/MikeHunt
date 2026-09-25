-- Visor Sprint 3/4: pricing breakdown, manufacturer options, assembly origin, availability status,
-- sold-listings comps, and a public-API key store.

-- Deals: structured pricing + VIN-decoded options/assembly + availability.
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS pricing_breakdown JSONB;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS price_gap_detected BOOLEAN DEFAULT false;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS options JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS assembly_country TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS assembly_plant TEXT;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS availability_status TEXT DEFAULT 'on_lot';
CREATE INDEX IF NOT EXISTS idx_deals_options ON public.deals USING GIN(options);
CREATE INDEX IF NOT EXISTS idx_deals_assembly ON public.deals(assembly_country) WHERE assembly_country IS NOT NULL;

-- Sold listings — actual transaction prices (Visor "sold" view). Anonymized market comps: public read.
CREATE TABLE IF NOT EXISTS public.sold_listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vin            TEXT,
  year           INT,
  make           TEXT,
  model          TEXT,
  trim           TEXT,
  mileage        INT,
  sold_price     NUMERIC,
  sold_at        TIMESTAMPTZ,
  source         TEXT,
  location_state TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sold_make_model ON public.sold_listings(make, model, year);
ALTER TABLE public.sold_listings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sold_public_read" ON public.sold_listings;
CREATE POLICY "sold_public_read" ON public.sold_listings FOR SELECT USING (true);

-- API keys for the public API (B2B). Keys are stored hashed; the plaintext is shown once.
CREATE TABLE IF NOT EXISTS public.api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT,
  key_hash      TEXT NOT NULL UNIQUE,
  key_prefix    TEXT,
  request_count BIGINT DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  revoked       BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON public.api_keys(key_hash);
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_keys" ON public.api_keys;
CREATE POLICY "own_keys" ON public.api_keys FOR ALL USING (user_id = auth.uid());
