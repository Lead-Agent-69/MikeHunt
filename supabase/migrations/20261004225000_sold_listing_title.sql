-- Short listing title on sold rows so a clean median can exclude salvage.
-- Text only. No photo bytes and no invented prices.
ALTER TABLE public.sold_listings
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_title_len;

ALTER TABLE public.sold_listings
  ADD CONSTRAINT sold_listings_title_len
    CHECK (title IS NULL OR char_length(btrim(title)) BETWEEN 1 AND 180);
