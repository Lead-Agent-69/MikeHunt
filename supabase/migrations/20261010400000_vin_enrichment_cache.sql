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
-- Public government data; reads are fine for anyone, writes only via the service role (no policy).
DROP POLICY IF EXISTS "nhtsa_recalls_cache_read" ON public.nhtsa_recalls_cache;
CREATE POLICY "nhtsa_recalls_cache_read" ON public.nhtsa_recalls_cache
  FOR SELECT USING (true);
REVOKE INSERT, UPDATE, DELETE ON public.nhtsa_recalls_cache FROM anon, authenticated;

-- Housekeeping: delete cache rows well past expiry. Safe to call from a cron route or pg_cron
-- (pg_cron is not assumed to be enabled). Keeps a 30-day grace so a NHTSA outage can serve stale.
CREATE OR REPLACE FUNCTION public.purge_expired_vin_cache()
RETURNS TABLE (vin_rows BIGINT, recall_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v BIGINT; r BIGINT;
BEGIN
  DELETE FROM public.vin_decodes WHERE expires_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v = ROW_COUNT;
  DELETE FROM public.nhtsa_recalls_cache WHERE expires_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS r = ROW_COUNT;
  RETURN QUERY SELECT v, r;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_vin_cache() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_vin_cache() TO service_role;
