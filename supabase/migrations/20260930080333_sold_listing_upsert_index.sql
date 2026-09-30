-- PostgREST ON CONFLICT needs a non-partial unique index for source + stable upstream ID.
-- NULL item IDs remain distinct under PostgreSQL's default NULLS DISTINCT behavior.
DROP INDEX IF EXISTS public.sold_listings_source_item_id_uidx;

CREATE UNIQUE INDEX sold_listings_source_item_id_uidx
  ON public.sold_listings (source, source_item_id);
