-- 20261010401000: vin_decodes.extras_attempts — cap the safety/EPA extras retries (Ren #330 nit).
-- Additive. Apply after 20261010400000 (#301); idempotent (IF NOT EXISTS, constraint re-added by name).
--
-- /api/vin/[vin]/specs (lib/vehicle/extras-ttl.ts) retries an incomplete extras set after 6h, counting
-- attempts here; after 3 the missing values are reported "n/a" for 180 days (heavy-duty trucks: no EPA
-- MPG above 8,500 lb GVWR, no NHTSA crash ratings). Until this is applied the route stores everything
-- but the counter and keeps retrying every 6h.
-- No grant or policy changes: vin_decodes is server-only (20261010420000); the column inherits that.
BEGIN;

ALTER TABLE public.vin_decodes
  ADD COLUMN IF NOT EXISTS extras_attempts SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE public.vin_decodes
  DROP CONSTRAINT IF EXISTS vin_decodes_extras_attempts_range,
  ADD CONSTRAINT vin_decodes_extras_attempts_range CHECK (extras_attempts BETWEEN 0 AND 100);

COMMENT ON COLUMN public.vin_decodes.extras_attempts IS
  'Safety/EPA extras lookups in the current cycle; >= 3 with a value still missing = n/a (extras-ttl.ts).';

DO $$
DECLARE def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.vin_decodes'::regclass AND attname = 'extras_attempts'
       AND atttypid = 'smallint'::regtype AND attnotnull AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'vin_decodes.extras_attempts missing or not SMALLINT NOT NULL';
  END IF;
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
   WHERE conrelid = 'public.vin_decodes'::regclass AND conname = 'vin_decodes_extras_attempts_range'
     AND contype = 'c' AND convalidated;
  IF def IS DISTINCT FROM 'CHECK (((extras_attempts >= 0) AND (extras_attempts <= 100)))' THEN
    RAISE EXCEPTION 'vin_decodes_extras_attempts_range missing or wrong: %', def;
  END IF;
  IF EXISTS (SELECT 1 FROM public.vin_decodes WHERE extras_attempts IS NULL) THEN
    RAISE EXCEPTION 'vin_decodes has NULL extras_attempts';
  END IF;
END
$$;

COMMIT;
