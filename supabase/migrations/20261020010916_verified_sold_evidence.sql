-- Keep completed-sale evidence honest and attributable.
--
-- Retail valuation readers use only basis='sold' rows whose sale_channel is NULL. Government
-- impound/fleet/surplus results live in a separate attributed lane, and last observed bids can
-- never masquerade as completed sales. Existing rows predate these fields and remain retail sold
-- observations through the defaults below.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.sold_listings
  ADD COLUMN IF NOT EXISTS basis TEXT NOT NULL DEFAULT 'sold',
  ADD COLUMN IF NOT EXISTS sale_channel TEXT,
  ADD COLUMN IF NOT EXISTS attribution TEXT,
  DROP CONSTRAINT IF EXISTS sold_listings_basis_check,
  ADD CONSTRAINT sold_listings_basis_check
    CHECK (basis IN ('sold', 'removed', 'last_bid')),
  DROP CONSTRAINT IF EXISTS sold_listings_sale_channel_check,
  ADD CONSTRAINT sold_listings_sale_channel_check
    CHECK (sale_channel IS NULL OR sale_channel IN (
      'gov_impound_auction',
      'gov_fleet_auction',
      'gov_surplus_auction'
    )),
  DROP CONSTRAINT IF EXISTS sold_listings_attribution_check,
  ADD CONSTRAINT sold_listings_attribution_check
    CHECK (
      attribution IS NULL OR (
        char_length(attribution) BETWEEN 1 AND 300
        AND attribution ~ '[[:alnum:]]'
      )
    ),
  DROP CONSTRAINT IF EXISTS sold_listings_gov_attribution_check,
  ADD CONSTRAINT sold_listings_gov_attribution_check
    CHECK (sale_channel IS NULL OR attribution IS NOT NULL),
  DROP CONSTRAINT IF EXISTS sold_listings_last_bid_evidence_check,
  ADD CONSTRAINT sold_listings_last_bid_evidence_check
    CHECK (basis <> 'last_bid' OR (sale_channel IS NOT NULL AND attribution IS NOT NULL)),
  DROP CONSTRAINT IF EXISTS sold_listings_norfolk_source_check,
  ADD CONSTRAINT sold_listings_norfolk_source_check
    CHECK (sale_channel <> 'gov_impound_auction' OR source = 'gov_norfolk_impound');

COMMENT ON COLUMN public.sold_listings.basis IS
  'sold = completed sale; removed = last ask before disappearance; last_bid = observed closing bid, not a confirmed sale.';
COMMENT ON COLUMN public.sold_listings.sale_channel IS
  'NULL for retail sale observations. Government auction results use an explicit lane and never enter retail valuation medians.';
COMMENT ON COLUMN public.sold_listings.attribution IS
  'Per-row publisher or licence credit required whenever sale_channel is set.';

CREATE INDEX IF NOT EXISTS idx_sold_retail_recent
  ON public.sold_listings (make, model, year, sold_at DESC)
  WHERE basis = 'sold' AND sale_channel IS NULL AND sold_price > 0;

CREATE INDEX IF NOT EXISTS idx_sold_gov_recent
  ON public.sold_listings (sale_channel, make, model, year, sold_at DESC)
  WHERE sale_channel IS NOT NULL AND sold_price > 0;

DO $$
DECLARE
  policy_count integer;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sold_listings'::regclass) THEN
    RAISE EXCEPTION 'sold_listings RLS must remain enabled';
  END IF;

  SELECT count(*) INTO policy_count
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'sold_listings';
  IF policy_count <> 0 THEN
    RAISE EXCEPTION 'sold_listings must remain server-only; found % policies', policy_count;
  END IF;

  IF has_table_privilege('anon', 'public.sold_listings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.sold_listings', 'SELECT') THEN
    RAISE EXCEPTION 'sold_listings became readable by a client role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.sold_listings'::regclass
       AND conname = 'sold_listings_gov_attribution_check'
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'sold_listings government attribution constraint is missing';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
