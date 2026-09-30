-- Give sold market records a stable upstream identity so repeated scrapes update the same sale
-- instead of inserting duplicates. Currency and country keep non-US observations out of USD pricing.
ALTER TABLE public.sold_listings
  ADD COLUMN IF NOT EXISTS source_item_id TEXT,
  ADD COLUMN IF NOT EXISTS source_url TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'US';

ALTER TABLE public.sold_listings
  ADD CONSTRAINT sold_listings_currency_code_format
    CHECK (currency_code ~ '^[A-Z]{3}$'),
  ADD CONSTRAINT sold_listings_country_code_format
    CHECK (country_code ~ '^[A-Z]{2}$');

CREATE UNIQUE INDEX IF NOT EXISTS sold_listings_source_item_id_uidx
  ON public.sold_listings (source, source_item_id)
  WHERE source IS NOT NULL AND source_item_id IS NOT NULL;
