-- Keep the source listing title for reported-title classification; legacy rows remain unknown.
ALTER TABLE public.sold_listings ADD COLUMN IF NOT EXISTS title TEXT;
COMMENT ON COLUMN public.sold_listings.title IS
  'Original source-reported listing title; not an independently verified vehicle title document.';
NOTIFY pgrst, 'reload schema';
