-- Free sold comps from open government data (Norfolk impound auctions, Seattle fleet sales), GSA
-- closing bids (GovAuctions.app CC BY 4.0 dataset) and GovDeals/AllSurplus lots the venue marks sold.
-- Needs Ren's sign-off before it is applied. Additive and idempotent; one transaction, and every
-- CHECK is dropped and re-added inside a single ALTER TABLE (no window without the constraint).
--
-- basis: what the price is. 'sold' = a completed sale; 'removed' = last ask of a listing that
--   disappeared (#264); 'last_bid' = the last observed bid when an auction closed, which is a bid
--   level, not a confirmed sale price (GSA). Retail readers filter basis = 'sold' AND sale_channel IS NULL
--   (lib/scoring/sold-scope), so 'last_bid' and gov rows never feed a retail median. The ADD COLUMN repeats #264's (20261010130000) on purpose, so this
--   file is safe whichever lands first.
-- attribution: the credit line a row's licence asks for (CC BY 4.0 for the GSA dataset) or the
--   public-domain publisher, stored per row so any surface that shows the row can show its source.
-- sale_channel: where the sale happened, so impound and fleet prices can stay in their own lane and
--   are never read as retail prices. NULL on legacy rows (eBay sold, ingest sold capture).

BEGIN;

ALTER TABLE public.sold_listings
  ADD COLUMN IF NOT EXISTS basis TEXT NOT NULL DEFAULT 'sold',
  ADD COLUMN IF NOT EXISTS attribution TEXT,
  ADD COLUMN IF NOT EXISTS sale_channel TEXT,
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
  DROP CONSTRAINT IF EXISTS sold_listings_attribution_len,
  ADD CONSTRAINT sold_listings_attribution_len
    CHECK (attribution IS NULL OR char_length(btrim(attribution)) BETWEEN 1 AND 300),
  -- Every gov / fleet / surplus / GSA row carries its source credit (shown wherever it's shown).
  DROP CONSTRAINT IF EXISTS sold_listings_gov_attribution,
  ADD CONSTRAINT sold_listings_gov_attribution
    CHECK (sale_channel IS NULL OR attribution IS NOT NULL);

COMMENT ON COLUMN public.sold_listings.basis IS
  'sold = completed sale price; removed = last ask of a listing that disappeared; last_bid = last observed bid at auction close (not a confirmed sale). Retail comps use sold with sale_channel NULL.';
COMMENT ON COLUMN public.sold_listings.attribution IS
  'Per-row source credit required by the data licence (e.g. CC BY 4.0) or the public-domain publisher. Shown wherever the row is shown.';
COMMENT ON COLUMN public.sold_listings.sale_channel IS
  'Where the sale happened (gov impound / fleet / surplus auction). NULL for retail marketplace rows; non-NULL rows never enter retail comps.';

CREATE INDEX IF NOT EXISTS idx_sold_basis_make_model
  ON public.sold_listings (basis, make, model, year);
-- Gov lane reads (/api/sold govLane): small partial index, retail rows aren't in it.
CREATE INDEX IF NOT EXISTS idx_sold_gov_lane
  ON public.sold_listings (make, model, year)
  WHERE sale_channel IS NOT NULL;

-- Self-check: the three constraints exist with the expected definitions and no row violates them.
DO $$
DECLARE
  def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_basis_check';
  IF def IS NULL OR def NOT LIKE '%last_bid%' OR def NOT LIKE '%removed%' THEN
    RAISE EXCEPTION 'sold_listings_basis_check missing or wrong: %', def;
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_sale_channel_check';
  IF def IS NULL OR def NOT LIKE '%gov_surplus_auction%' THEN
    RAISE EXCEPTION 'sold_listings_sale_channel_check missing or wrong: %', def;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_attribution_len') THEN
    RAISE EXCEPTION 'sold_listings_attribution_len missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_gov_attribution') THEN
    RAISE EXCEPTION 'sold_listings_gov_attribution missing';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
