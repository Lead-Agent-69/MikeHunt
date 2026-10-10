-- Follow-up to 20261010411000 (#324, Ren SIGNED with nits). Constraint + check only, no data change.
--
-- 1. sold_listings_attribution_nonblank: CHECK (attribution IS NULL OR attribution ~ '[[:alnum:]]').
--    410000's attribution_len uses char_length(btrim(attribution)) >= 1, and btrim only strips
--    spaces, so a credit of tabs/newlines passed as "non-blank". '\S' (first version) still let
--    NBSP (U+00A0), zero-width space (U+200B) and BOM (U+FEFF) through; a credit must contain at
--    least one letter or digit (Ren #331). This is a separate constraint (ANDed
--    with attribution_len, which keeps the 300-char cap) rather than a rewrite of attribution_len, so
--    the signed 410000/411000 files and 411000's self-check stay valid on any re-run.
-- 2. Self-check compares each definition to pg_get_constraintdef's exact output (PG17 deparse), word
--    for word: no lower-casing, no stripping, so 'LAST_BID', 'last_ bid' or '(last_bid)' inside a
--    literal fail: attribution_len, attribution_nonblank, gov_attribution, last_bid_attribution. Also
--    fails when the sale_channel CHECK yields no channel list at all.
-- 3. sale_channel list hazard (#316 410000 vs #320 500000 'ebay'): the CHECK must keep the three gov
--    channels, and must contain 'ebay' as soon as 20261010500000 is recorded or any row uses 'ebay'.
--    The list's single source of truth is lib/scoring/sale-channels.ts, and
--    lib/scoring/sale-channels.test.ts fails CI if the latest migration's list differs from it or if
--    any later migration narrows an earlier list. RE-RUN RULE: 410000 hard-codes the gov-only list;
--    re-running it after 500000 narrows the CHECK, so re-run the latest sale_channel definer
--    (500000) right after it and then this file, whose self-check fails if 'ebay' was dropped.
-- Needs Ren SIGN before any hosted apply. Apply after 20261010411000.

BEGIN;

ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_attribution_nonblank,
  ADD CONSTRAINT sold_listings_attribution_nonblank
    CHECK (attribution IS NULL OR attribution ~ '[[:alnum:]]');

DO $$
DECLARE
  want record;
  def text;
  chans text[];
  ebay_needed boolean;
BEGIN
  FOR want IN
    SELECT * FROM (VALUES
      ('sold_listings_attribution_len',
       'CHECK (((attribution IS NULL) OR ((char_length(btrim(attribution)) >= 1) AND (char_length(btrim(attribution)) <= 300))))'),
      ('sold_listings_attribution_nonblank',
       'CHECK (((attribution IS NULL) OR (attribution ~ ''[[:alnum:]]''::text)))'),
      ('sold_listings_gov_attribution',
       'CHECK (((sale_channel IS NULL) OR (attribution IS NOT NULL)))'),
      ('sold_listings_last_bid_attribution',
       'CHECK (((basis <> ''last_bid''::text) OR (attribution IS NOT NULL)))')
    ) AS t(conname, exact)
  LOOP
    SELECT pg_get_constraintdef(c.oid) INTO def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.sold_listings'::regclass AND c.conname = want.conname
       AND c.contype = 'c' AND c.convalidated;
    IF def IS DISTINCT FROM want.exact THEN
      RAISE EXCEPTION '% missing, not validated, or wrong definition: %', want.conname, def;
    END IF;
  END LOOP;

  SELECT pg_get_constraintdef(c.oid) INTO def
    FROM pg_constraint c
   WHERE c.conrelid = 'public.sold_listings'::regclass AND c.conname = 'sold_listings_sale_channel_check'
     AND c.contype = 'c' AND c.convalidated;
  IF def IS NULL THEN
    RAISE EXCEPTION 'sold_listings_sale_channel_check missing or not validated';
  END IF;
  SELECT array_agg(m[1]) INTO chans FROM regexp_matches(def, '''([a-z_]+)''::text', 'g') AS m;
  IF chans IS NULL THEN
    RAISE EXCEPTION 'sold_listings_sale_channel_check has no channel list: %', def;
  END IF;
  IF NOT (chans @> ARRAY['gov_impound_auction', 'gov_fleet_auction', 'gov_surplus_auction']) THEN
    RAISE EXCEPTION 'sold_listings_sale_channel_check lost a gov channel: %', def;
  END IF;
  ebay_needed := EXISTS (SELECT 1 FROM public.sold_listings WHERE sale_channel = 'ebay');
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT $1 OR EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = ''20261010500000'')'
      INTO ebay_needed USING ebay_needed;
  END IF;
  IF ebay_needed AND NOT ('ebay' = ANY (chans)) THEN
    RAISE EXCEPTION 'sold_listings_sale_channel_check dropped ''ebay'' (20261010500000 is applied): % -- re-run 20261010500000', def;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
