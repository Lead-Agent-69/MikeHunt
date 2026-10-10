-- VIN enrichment: full NHTSA vPIC decode (DecodeVinValuesExtended) cached per VIN in the existing
-- vin_decodes table, plus a recalls cache keyed by make/model/year (many VINs share one recall list,
-- so storing campaigns per VIN would duplicate them).
--
-- TTLs: decode rows expire after 180 days (vPIC data is corrected over time, and stale rows for VINs
-- nobody looks at again are dead weight on Supabase Free's 500 MB). Recall rows expire after 7 days.
-- Rows past expires_at are refreshed on next read; purge_expired_vin_cache() deletes old ones.
--
-- Sizing (measured from recorded vPIC responses, see docs/vin-enrichment.md): ~0.35-0.4 KB heap per
-- vin_decodes row, ~0.5 KB with page overhead + both indexes; recalls rows ~0.2 KB + ~175 B per campaign.
-- 100k VINs ~= 50 MB. raw JSONB (the full 154-key response, ~4 KB) is NOT stored.
--
-- Ren review (#301 @ 41cc6aa): nhtsa_recalls_cache is server-only (every reader and writer is the
-- service-role client in lib/vehicle/vin-enrichment.ts); purge_expired_vin_cache() is SECURITY
-- INVOKER with an empty search_path; old vin_decodes rows get an expiry backfilled from decoded_at
-- so the purge reaches them; one transaction with a self-check.
-- Needs Ren SIGN before any hosted apply.

BEGIN;

ALTER TABLE public.vin_decodes
  ADD COLUMN IF NOT EXISTS series               TEXT,
  ADD COLUMN IF NOT EXISTS doors                INT,
  ADD COLUMN IF NOT EXISTS vehicle_type         TEXT,
  ADD COLUMN IF NOT EXISTS manufacturer         TEXT,
  ADD COLUMN IF NOT EXISTS engine               TEXT,
  ADD COLUMN IF NOT EXISTS engine_configuration TEXT,
  ADD COLUMN IF NOT EXISTS engine_hp            NUMERIC,
  ADD COLUMN IF NOT EXISTS engine_model         TEXT,
  ADD COLUMN IF NOT EXISTS transmission_style   TEXT,
  ADD COLUMN IF NOT EXISTS transmission_speeds  INT,
  ADD COLUMN IF NOT EXISTS gvwr                 TEXT,
  ADD COLUMN IF NOT EXISTS gvwr_max_lb          INT,
  ADD COLUMN IF NOT EXISTS plant_company        TEXT,
  ADD COLUMN IF NOT EXISTS plant_city           TEXT,
  ADD COLUMN IF NOT EXISTS plant_state          TEXT,
  ADD COLUMN IF NOT EXISTS decode_error_code    TEXT,
  ADD COLUMN IF NOT EXISTS decode_clean         BOOLEAN,
  -- Set only by the extended decode; NULL marks a row written by the older DecodeVinValues path.
  ADD COLUMN IF NOT EXISTS extended_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at           TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS vin_decodes_expires_at_idx
  ON public.vin_decodes (expires_at);

CREATE TABLE IF NOT EXISTS public.nhtsa_recalls_cache (
  make           TEXT NOT NULL,          -- upper-cased
  model          TEXT NOT NULL,          -- upper-cased vPIC model name
  model_year     INT  NOT NULL,
  recalls_count  INT  NOT NULL,
  campaigns      JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{campaign, component, reportReceived, parkIt, parkOutside, overTheAir, model}]
  models_queried TEXT[] NOT NULL DEFAULT '{}',        -- recalls-catalog names unioned (e.g. F-250 SD)
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  PRIMARY KEY (make, model, model_year)
);

CREATE INDEX IF NOT EXISTS nhtsa_recalls_cache_expires_at_idx
  ON public.nhtsa_recalls_cache (expires_at);

ALTER TABLE public.nhtsa_recalls_cache ENABLE ROW LEVEL SECURITY;
-- Server-only: no policy (RLS denies client roles even if a grant comes back), no client grants.
DROP POLICY IF EXISTS "nhtsa_recalls_cache_read" ON public.nhtsa_recalls_cache;
REVOKE ALL ON public.nhtsa_recalls_cache FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nhtsa_recalls_cache TO service_role;

-- Rows written before this migration (DecodeVinValues path) have no expires_at; give them one from
-- decoded_at so purge_expired_vin_cache() can reach them. They are re-decoded on next read anyway
-- (no extended_at), so this only bounds how long an unread legacy row is kept.
UPDATE public.vin_decodes
   SET expires_at = COALESCE(decoded_at, NOW()) + INTERVAL '180 days'
 WHERE expires_at IS NULL;

-- Housekeeping: delete cache rows 30 days past expiry (the grace lets a NHTSA outage serve stale).
-- Called daily by /api/cron/retention with the service role. INVOKER: it runs with the caller's
-- rights, so a client role could not delete anything even if it could execute it.
DROP FUNCTION IF EXISTS public.purge_expired_vin_cache();
CREATE FUNCTION public.purge_expired_vin_cache()
RETURNS TABLE (vin_rows BIGINT, recall_rows BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v BIGINT; r BIGINT;
BEGIN
  DELETE FROM public.vin_decodes WHERE expires_at < pg_catalog.now() - INTERVAL '30 days';
  GET DIAGNOSTICS v = ROW_COUNT;
  DELETE FROM public.nhtsa_recalls_cache WHERE expires_at < pg_catalog.now() - INTERVAL '30 days';
  GET DIAGNOSTICS r = ROW_COUNT;
  RETURN QUERY SELECT v, r;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_vin_cache() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_vin_cache() TO service_role;

-- Self-check: fail the migration if a client role keeps any access or the server loses it.
DO $$
DECLARE
  r text;
  p text;
  n integer;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(r, 'public.nhtsa_recalls_cache', p) THEN
        RAISE EXCEPTION 'nhtsa_recalls_cache still % -able by %', p, r;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege(r, 'public.nhtsa_recalls_cache', p) THEN
        RAISE EXCEPTION 'nhtsa_recalls_cache has a column % -able by %', p, r;
      END IF;
    END LOOP;
    IF has_function_privilege(r, 'public.purge_expired_vin_cache()', 'EXECUTE') THEN
      RAISE EXCEPTION 'purge_expired_vin_cache() executable by %', r;
    END IF;
  END LOOP;

  FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('service_role', 'public.nhtsa_recalls_cache', p) THEN
      RAISE EXCEPTION 'service_role cannot % nhtsa_recalls_cache', p;
    END IF;
  END LOOP;
  IF NOT has_table_privilege('service_role', 'public.vin_decodes', 'DELETE') THEN
    RAISE EXCEPTION 'service_role cannot DELETE vin_decodes (purge would fail)';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.purge_expired_vin_cache()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot execute purge_expired_vin_cache()';
  END IF;

  -- INVOKER + RLS on both tables: the purge only deletes because service_role bypasses RLS.
  IF NOT (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'service_role must have BYPASSRLS for the INVOKER purge to delete anything';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.purge_expired_vin_cache()'::regprocedure) THEN
    RAISE EXCEPTION 'purge_expired_vin_cache() must be SECURITY INVOKER';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.nhtsa_recalls_cache'::regclass) THEN
    RAISE EXCEPTION 'nhtsa_recalls_cache RLS is not enabled';
  END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'nhtsa_recalls_cache';
  IF n <> 0 THEN
    RAISE EXCEPTION 'nhtsa_recalls_cache has % policies (expected 0)', n;
  END IF;

  SELECT count(*) INTO n FROM public.vin_decodes WHERE expires_at IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION '% vin_decodes rows still have no expires_at', n;
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
