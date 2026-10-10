-- Data quality, part 3: listing provenance (gap audit section I.7 + Ren's lineage review).
--
-- Every deals row already has source, source_deal_id (source listing id), source_url, first_seen_at.
-- This adds:
--   deals.fetched_at     timestamptz  when the row was last fetched (stamped by upsertDeals per batch).
--                                     Backfilled from last_seen_at (the last time a scrape saw it).
--   deals.access_basis   text         access class of the row at fetch time, from
--                                     lib/scrapers/access-class.ts accessClassFor (#290): api | allowed |
--                                     restricted | operator_override | unreviewed. curated_dealers rows
--                                     are classified by host. NOT backfilled (the classifier is TS):
--                                     NULL = not recorded yet; set on each row's next re-fetch.
--   price_history.source text         which source observed the price. Backfilled from the deal.
--                                     price_history.observed_at is the when.
--   deal_source 'unknown'             /api/ingest and save-from-url store a source they can't identify as
--                                     'unknown' (access_basis 'unreviewed') instead of relabelling it
--                                     independent_dealer.
--
-- Free tier: three thin nullable columns, no index. One enum value.
-- Privileges: deals uses column-level SELECT grants (20261010020000); the new columns are not granted,
-- so they are server-only (guard below). price_history has no anon/authenticated SELECT (guard below).
-- Data change: UPDATE deals SET fetched_at (~5.8k rows), UPDATE price_history SET source (~5.2k rows).
-- Enum note: ADD VALUE is not used inside this transaction (PG forbids using a new enum value in the
-- transaction that adds it), only added.

ALTER TYPE public.deal_source ADD VALUE IF NOT EXISTS 'unknown';

BEGIN;

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS fetched_at timestamptz;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS access_basis text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_access_basis_check') THEN
    ALTER TABLE public.deals ADD CONSTRAINT deals_access_basis_check CHECK (
      access_basis IS NULL
      OR access_basis IN ('api', 'allowed', 'restricted', 'operator_override', 'unreviewed')
    );
  END IF;
END $$;
COMMENT ON COLUMN public.deals.fetched_at IS 'Last fetch of this listing (upsertDeals batch time). Server-only.';
COMMENT ON COLUMN public.deals.access_basis IS 'Access class at fetch time (lib/scrapers/access-class.ts). NULL = not recorded yet. Server-only.';

ALTER TABLE public.price_history ADD COLUMN IF NOT EXISTS source text;
COMMENT ON COLUMN public.price_history.source IS 'deal source that observed this price; observed_at is when.';

UPDATE public.deals
SET fetched_at = coalesce(last_seen_at, updated_at, created_at)
WHERE fetched_at IS NULL;

UPDATE public.price_history ph
SET source = d.source::text
FROM public.deals d
WHERE d.id = ph.deal_id AND ph.source IS NULL;

-- Guard: new columns stay server-only.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    IF has_column_privilege(r.rolname, 'public.deals', 'fetched_at', 'SELECT')
       OR has_column_privilege(r.rolname, 'public.deals', 'access_basis', 'SELECT') THEN
      RAISE EXCEPTION 'deals.fetched_at/access_basis must not be selectable by %', r.rolname;
    END IF;
    IF has_column_privilege(r.rolname, 'public.price_history', 'source', 'SELECT') THEN
      RAISE EXCEPTION 'price_history.source must not be selectable by %', r.rolname;
    END IF;
  END LOOP;
END $$;

COMMIT;
