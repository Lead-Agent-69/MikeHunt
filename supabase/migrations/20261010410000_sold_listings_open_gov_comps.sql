-- Free sold comps from open government data (Norfolk impound auctions, Seattle fleet sales), GSA
-- closing bids (GovAuctions.app CC BY 4.0 dataset) and GovDeals/AllSurplus lots the venue marks sold.
-- Needs Ren's sign-off before it is applied. Additive and idempotent.
--
-- basis: what the price is. 'sold' = a completed sale; 'removed' = last ask of a listing that
--   disappeared (#264); 'last_bid' = the last observed bid when an auction closed, which is a bid
--   level, not a confirmed sale price (GSA). Sold-comp readers filter basis = 'sold', so 'last_bid'
--   rows never feed a sold median. The ADD COLUMN repeats #264's (20261010130000) on purpose, so this
--   file is safe whichever lands first.
-- attribution: the credit line a row's licence asks for (CC BY 4.0 for the GSA dataset) or the
--   public-domain publisher, stored per row so any surface that shows the row can show its source.
-- sale_channel: where the sale happened, so impound and fleet prices can stay in their own lane and
--   are never read as retail prices. NULL on legacy rows (eBay sold, ingest sold capture).

ALTER TABLE public.sold_listings
  ADD COLUMN IF NOT EXISTS basis TEXT NOT NULL DEFAULT 'sold',
  ADD COLUMN IF NOT EXISTS attribution TEXT,
  ADD COLUMN IF NOT EXISTS sale_channel TEXT;

ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_basis_check;
ALTER TABLE public.sold_listings
  ADD CONSTRAINT sold_listings_basis_check
    CHECK (basis IN ('sold', 'removed', 'last_bid'));

ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_sale_channel_check;
ALTER TABLE public.sold_listings
  ADD CONSTRAINT sold_listings_sale_channel_check
    CHECK (sale_channel IS NULL OR sale_channel IN (
      'gov_impound_auction',
      'gov_fleet_auction',
      'gov_surplus_auction'
    ));

ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_attribution_len;
ALTER TABLE public.sold_listings
  ADD CONSTRAINT sold_listings_attribution_len
    CHECK (attribution IS NULL OR char_length(btrim(attribution)) BETWEEN 1 AND 300);

COMMENT ON COLUMN public.sold_listings.basis IS
  'sold = completed sale price; removed = last ask of a listing that disappeared; last_bid = last observed bid at auction close (not a confirmed sale). Comps use sold only.';
COMMENT ON COLUMN public.sold_listings.attribution IS
  'Per-row source credit required by the data licence (e.g. CC BY 4.0) or the public-domain publisher.';
COMMENT ON COLUMN public.sold_listings.sale_channel IS
  'Where the sale happened (gov impound / fleet / surplus auction). NULL for legacy marketplace rows.';

CREATE INDEX IF NOT EXISTS idx_sold_basis_make_model
  ON public.sold_listings (basis, make, model, year);

NOTIFY pgrst, 'reload schema';
