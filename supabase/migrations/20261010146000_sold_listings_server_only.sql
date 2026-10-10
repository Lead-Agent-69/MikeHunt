-- sold_listings: server-only (Ren P2).
--
-- 20260622050000_visor_s3_s4 created sold_listings with policy sold_public_read (FOR SELECT
-- USING (true)) and the Supabase default client grants. Together those let anon read every row
-- over PostgREST, including vin, source_url and source_item_id.
--
-- Every reader and writer uses the service-role client (it bypasses RLS):
--   readers: app/api/sold, app/api/market/sold, app/api/system/status, lib/scoring/market-value
--            (loadSoldIndex via loadMarketIndex: scraper pipeline, admin rescore, accuracy)
--   writers: lib/scrapers/sources/ebay-sold (upsert), app/api/ingest (insert)
-- No browser, extension or anon reader exists, so client roles need no access.
--
-- RLS stays on with no policies: client roles are denied even if a grant comes back.
-- The self-check also walks pg_depend: no view over sold_listings may be readable by a client role,
-- and no SECURITY DEFINER function that reads it may be executable by one (either would hand the
-- rows back without touching the table grants).
-- Needs Ren SIGN before any hosted apply.

BEGIN;

DROP POLICY IF EXISTS "sold_public_read" ON public.sold_listings;

REVOKE ALL ON public.sold_listings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sold_listings TO service_role;

ALTER TABLE public.sold_listings ENABLE ROW LEVEL SECURITY;

-- Self-check: fail the migration if a client role keeps any access or the server loses it.
DO $$
DECLARE
  r text;
  p text;
  n integer;
  obj oid;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(r, 'public.sold_listings', p) THEN
        RAISE EXCEPTION 'sold_listings still % -able by %', p, r;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege(r, 'public.sold_listings', p) THEN
        RAISE EXCEPTION 'sold_listings has a column % -able by %', p, r;
      END IF;
    END LOOP;
  END LOOP;

  FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('service_role', 'public.sold_listings', p) THEN
      RAISE EXCEPTION 'service_role cannot % sold_listings', p;
    END IF;
  END LOOP;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sold_listings'::regclass) THEN
    RAISE EXCEPTION 'sold_listings RLS is not enabled';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sold_listings';
  IF n <> 0 THEN
    RAISE EXCEPTION 'sold_listings has % policies (expected 0)', n;
  END IF;

  -- Views (and materialized views) built on sold_listings: pg_depend -> pg_rewrite -> view.
  FOR obj IN
    SELECT DISTINCT rw.ev_class
    FROM pg_depend d
    JOIN pg_rewrite rw ON rw.oid = d.objid
    WHERE d.classid = 'pg_rewrite'::regclass
      AND d.refobjid = 'public.sold_listings'::regclass
      AND rw.ev_class <> 'public.sold_listings'::regclass
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(r, obj, 'SELECT') THEN
        RAISE EXCEPTION 'view % over sold_listings is SELECT-able by %', obj::regclass, r;
      END IF;
    END LOOP;
  END LOOP;

  -- SECURITY DEFINER functions that read sold_listings: SQL BEGIN ATOMIC bodies record a pg_depend
  -- row; plpgsql and plain SQL bodies do not, so their source is matched too.
  FOR obj IN
    SELECT p2.oid
    FROM pg_proc p2
    JOIN pg_namespace ns ON ns.oid = p2.pronamespace
    WHERE p2.prosecdef
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND (
        p2.prosrc ILIKE '%sold_listings%'
        OR EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p2.oid
            AND d.refobjid = 'public.sold_listings'::regclass
        )
      )
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(r, obj, 'EXECUTE') THEN
        RAISE EXCEPTION 'SECURITY DEFINER function % reads sold_listings and is executable by %',
          obj::regprocedure, r;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
