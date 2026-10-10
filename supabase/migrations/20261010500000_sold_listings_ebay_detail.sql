-- eBay sold capture detail (Jonah 2026-10-10: "save the eBay sold prices and other info").
-- Needs Ren's sign-off before it is applied. Additive and idempotent; no data change, no grant change.
--
-- New thin columns on sold_listings (text only, no photos):
--   location_city  city from the card's explicit "Located in City, ST" line (state already exists)
--   condition      eBay item condition as shown: used / certified / new / for_parts
--   title_status   title brand stated in the listing title or subtitle: clean / salvage / rebuilt /
--                  flood / lemon. NULL when the listing says nothing.
--   sale_channel   repeated from 20261010410000 (#302) on purpose, so this file is safe whichever lands
--                  first. 'ebay' joins the three government channels. The CHECK below is the union of
--                  #302's list and 'ebay'; a later rebuild of #302 must keep 'ebay' in its list.
--
-- Ordering: lands after #264 (130000), #282 (146000) and #302 (410000). sold_listings stays
-- server-only (146000); new columns inherit the table's privileges, and nothing here grants any.

BEGIN;

ALTER TABLE public.sold_listings
  ADD COLUMN IF NOT EXISTS sale_channel TEXT,
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS condition TEXT,
  ADD COLUMN IF NOT EXISTS title_status TEXT;

ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_sale_channel_check,
  ADD CONSTRAINT sold_listings_sale_channel_check
    CHECK (sale_channel IS NULL OR sale_channel IN (
      'gov_impound_auction',
      'gov_fleet_auction',
      'gov_surplus_auction',
      'ebay'
    )),
  DROP CONSTRAINT IF EXISTS sold_listings_location_city_len,
  ADD CONSTRAINT sold_listings_location_city_len
    CHECK (location_city IS NULL OR char_length(btrim(location_city)) BETWEEN 1 AND 60),
  DROP CONSTRAINT IF EXISTS sold_listings_condition_check,
  ADD CONSTRAINT sold_listings_condition_check
    CHECK (condition IS NULL OR condition IN ('used', 'certified', 'new', 'for_parts')),
  DROP CONSTRAINT IF EXISTS sold_listings_title_status_check,
  ADD CONSTRAINT sold_listings_title_status_check
    CHECK (title_status IS NULL OR title_status IN ('clean', 'salvage', 'rebuilt', 'flood', 'lemon'));

COMMENT ON COLUMN public.sold_listings.location_city IS
  'City from an explicit "Located in City, ST" line only. Never geocoded or guessed.';
COMMENT ON COLUMN public.sold_listings.condition IS
  'Item condition as the listing shows it: used / certified / new / for_parts.';
COMMENT ON COLUMN public.sold_listings.title_status IS
  'Title brand stated in the listing (clean / salvage / rebuilt / flood / lemon). NULL = not stated.';
COMMENT ON COLUMN public.sold_listings.sale_channel IS
  'Where the sale happened: ebay, or a government impound / fleet / surplus auction. NULL for legacy rows.';

-- Self-check: the columns and constraints exist, and once #282 (146000) is applied the table is still
-- unreadable and unwritable for anon / authenticated.
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY['sale_channel', 'location_city', 'condition', 'title_status']) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sold_listings' AND column_name = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'sold_listings detail columns missing: %', missing;
  END IF;

  SELECT string_agg(c, ', ') INTO missing
  FROM unnest(ARRAY[
    'sold_listings_sale_channel_check',
    'sold_listings_location_city_len',
    'sold_listings_condition_check',
    'sold_listings_title_status_check'
  ]) AS c
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sold_listings'::regclass AND conname = c
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'sold_listings detail constraints missing: %', missing;
  END IF;

  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261010146000'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.role_table_grants
       WHERE table_schema = 'public' AND table_name = 'sold_listings'
         AND grantee IN ('anon', 'authenticated', 'PUBLIC')
     ) THEN
    RAISE EXCEPTION 'sold_listings has client table privileges after 20261010146000';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
