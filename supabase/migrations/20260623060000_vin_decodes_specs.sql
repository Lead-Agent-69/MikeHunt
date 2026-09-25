-- Cache the additional free vehicle intelligence: EPA MPG + NHTSA crash-test stars.
ALTER TABLE public.vin_decodes
  ADD COLUMN IF NOT EXISTS mpg_city        INT,
  ADD COLUMN IF NOT EXISTS mpg_highway     INT,
  ADD COLUMN IF NOT EXISTS mpg_combined    INT,
  ADD COLUMN IF NOT EXISTS safety_overall  INT,
  ADD COLUMN IF NOT EXISTS safety_frontal  INT,
  ADD COLUMN IF NOT EXISTS safety_side     INT,
  ADD COLUMN IF NOT EXISTS safety_rollover INT,
  ADD COLUMN IF NOT EXISTS extras_at       TIMESTAMPTZ;
