-- Free authoritative vehicle data from NHTSA vPIC (decode) + Recalls API — cached per VIN. Decode is
-- immutable per VIN (cache forever); recalls change, so they carry their own timestamp for TTL.
CREATE TABLE IF NOT EXISTS public.vin_decodes (
  vin           TEXT PRIMARY KEY,
  year          INT,
  make          TEXT,
  model         TEXT,
  trim          TEXT,
  body_class    TEXT,
  drive_type    TEXT,
  fuel_type     TEXT,
  cylinders     INT,
  displacement_l NUMERIC,
  plant_country TEXT,
  made_in_usa   BOOLEAN,
  recalls_count INT,
  raw           JSONB,
  decoded_at    TIMESTAMPTZ DEFAULT NOW(),
  recalls_at    TIMESTAMPTZ
);

ALTER TABLE public.vin_decodes ENABLE ROW LEVEL SECURITY;
-- Public read (authoritative public data); writes via service role.
DROP POLICY IF EXISTS "vin_decodes_read" ON public.vin_decodes;
CREATE POLICY "vin_decodes_read" ON public.vin_decodes FOR SELECT USING (true);
