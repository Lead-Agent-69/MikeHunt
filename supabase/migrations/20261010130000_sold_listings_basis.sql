-- What a sold_listings price is. 'sold' = a completed sale (every existing row: the eBay sold
-- collector, the ingest sold capture). 'removed' = a listing that disappeared, stored with its last
-- ask; that is not a sale price and sold-comp readers never use it (they filter basis = 'sold').
-- Needs Ren's sign-off before it is applied. Additive and idempotent; existing rows backfill to 'sold'
-- through the column default.
ALTER TABLE public.sold_listings
  ADD COLUMN IF NOT EXISTS basis TEXT NOT NULL DEFAULT 'sold';

ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_basis_check;

ALTER TABLE public.sold_listings
  ADD CONSTRAINT sold_listings_basis_check
    CHECK (basis IN ('sold', 'removed'));

COMMENT ON COLUMN public.sold_listings.basis IS
  'sold = completed sale price; removed = last ask of a listing that disappeared (not a sale). Comps use sold only.';

-- Readers filter basis = 'sold' alongside make/model/year.
CREATE INDEX IF NOT EXISTS idx_sold_basis_make_model
  ON public.sold_listings (basis, make, model, year);

NOTIFY pgrst, 'reload schema';
