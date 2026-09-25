-- Index maintenance (safe: DROP IF EXISTS + additive CREATE IF NOT EXISTS).
--
-- 1) Drop the broken/duplicate cars geo index. 20260624000000 created idx_deals_geography on
--    ST_MakePoint(longitude, latitude) — but the columns are lng/lat (initial_schema), so it references
--    nonexistent columns. It is also redundant with listings_geo_idx (GIST on the real `location` column).
DROP INDEX IF EXISTS idx_deals_geography;

-- 2) Properties (HOMES) had only single-column partial indexes; the hot read path in queryProperties
--    filters active + state and orders by lead_score — add the composite so that access path is indexed.
CREATE INDEX IF NOT EXISTS idx_properties_state_score
  ON properties (state, lead_score DESC NULLS LAST)
  WHERE active;

-- 3) Freshness is a harvest concern (re-score, stale detection) but properties had no time index.
CREATE INDEX IF NOT EXISTS idx_properties_scraped_at
  ON properties (scraped_at DESC NULLS LAST);
