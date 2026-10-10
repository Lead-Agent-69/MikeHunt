-- Follow-up to 20261010410000 (#316, Ren SIGN-with-nits). Constraint + check only, no data change.
--
-- sold_listings_last_bid_attribution: every basis = 'last_bid' row (GSA closing bids, CC BY 4.0)
--   carries its credit line, even if a future writer forgets sale_channel. Together with
--   sold_listings_gov_attribution (sale_channel set => attribution set) no licensed row can be stored
--   without the text that has to be shown with it.
-- The self-check verifies both constraints by DEFINITION (pg_get_constraintdef), not just by name, so a
--   same-named constraint with a weaker expression fails the migration.
-- Needs Ren SIGN before any hosted apply. Apply after 20261010410000.

BEGIN;

-- Fails loudly if a last_bid row without attribution already exists (none can: the GSA writer always
-- sets it and refuses to run before 410000).
ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_last_bid_attribution,
  ADD CONSTRAINT sold_listings_last_bid_attribution
    CHECK (basis <> 'last_bid' OR attribution IS NOT NULL);

DO $$
DECLARE
  def text;
  norm text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_last_bid_attribution'
     AND contype = 'c' AND convalidated;
  norm := regexp_replace(lower(coalesce(def, '')), '[\s()]', '', 'g');
  IF norm NOT IN ('checkbasis<>''last_bid''::textorattributionisnotnull') THEN
    RAISE EXCEPTION 'sold_listings_last_bid_attribution missing or wrong definition: %', def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_gov_attribution'
     AND contype = 'c' AND convalidated;
  norm := regexp_replace(lower(coalesce(def, '')), '[\s()]', '', 'g');
  IF norm NOT IN ('checksale_channelisnullorattributionisnotnull') THEN
    RAISE EXCEPTION 'sold_listings_gov_attribution missing or wrong definition: %', def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_attribution_len'
     AND contype = 'c';
  IF def IS NULL OR def NOT LIKE '%btrim(attribution)%' OR def NOT LIKE '%300%' THEN
    RAISE EXCEPTION 'sold_listings_attribution_len missing or wrong definition: %', def;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
