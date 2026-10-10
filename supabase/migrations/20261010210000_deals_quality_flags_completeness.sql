-- Data quality, part 1: ingest sanity flags + field completeness on deals (gap audit section I.4/I.6).
--
-- quality_flags text[]  NULL when clean. Otherwise every reason the listing failed a sanity check:
--                       price_below_300 (asks only; a live auction lot's current bid is exempt),
--                       price_above_500k, mileage_negative, mileage_above_500k, mileage_implausible
--                       (< 100 mi on a car 3+ model years old, or > 150k mi per year of age),
--                       year_before_1950, year_after_next_model_year, vin_bad_format, vin_check_digit,
--                       year_vin_mismatch (stated year 2+ off the VIN's model-year code), make_unknown.
--                       Flagged rows are KEPT (never dropped) but stay out of scoring and valuation:
--                       upsertDeals stores no profit / score / max bid / sell estimate and never a GO,
--                       and the market-comps index skips them. Written by lib/data-quality/sanity.ts.
-- completeness smallint 0-100: photo 25, VIN 20, mileage 15, price 15, title status 15, location 10
--                       (state only = 5). Feeds the enrichment budget (lib/scrapers/enrich-priority.ts).
--
-- Free tier: two thin nullable columns, no index (nothing filters on them at scale yet).
-- Privileges: deals uses column-level SELECT grants (20261010020000). New columns are not granted to
-- anon / authenticated, so both are server-only; the guard below fails the migration otherwise.
-- public.vin_check_digit_ok(text): immutable ISO 3779 check-digit test, same as lib/vehicle/vin.ts
-- isValidVin. Used by this backfill and by dedupe_deals (20261010220000: bad-check-digit VINs are
-- never a dedup key). EXECUTE stays default (pure function over its argument, reads no table).
-- Data change: one backfill UPDATE over existing rows (~5k on hosted). make_unknown needs the TS
-- known-make list, so it is set on each row's next re-ingest, not here.

BEGIN;

CREATE OR REPLACE FUNCTION public.vin_check_digit_ok(p_vin text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $$
  SELECT CASE
    WHEN v !~ '^[A-HJ-NPR-Z0-9]{17}$' THEN false
    ELSE substr(v, 9, 1) = (
      SELECT CASE WHEN s % 11 = 10 THEN 'X' ELSE (s % 11)::text END
      FROM (
        SELECT sum(
          translate(substr(v, i, 1), 'ABCDEFGHJKLMNPRSTUVWXYZ', '12345678123457923456789')::int
          * (ARRAY[8,7,6,5,4,3,2,10,0,9,8,7,6,5,4,3,2])[i]
        ) AS s
        FROM generate_series(1, 17) AS i
      ) t
    )
  END
  FROM (SELECT upper(regexp_replace(coalesce(p_vin, ''), '[\s-]', '', 'g')) AS v) x;
$$;

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS quality_flags text[];
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS completeness smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_completeness_range') THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_completeness_range CHECK (completeness IS NULL OR completeness BETWEEN 0 AND 100);
  END IF;
END $$;

COMMENT ON COLUMN public.deals.quality_flags IS
  'Sanity-check reasons (lib/data-quality/sanity.ts). NULL = clean. Flagged rows are kept but excluded from scoring and valuation.';
COMMENT ON COLUMN public.deals.completeness IS
  'Field completeness 0-100 (photo 25, VIN 20, mileage 15, price 15, title status 15, location 10).';

-- Backfill. Mirrors qualityFlags() / completenessScore() except the VIN check digit.
WITH calc AS (
  SELECT
    d.id,
    array_remove(ARRAY[
      CASE WHEN d.ask_price IS NOT NULL AND d.ask_price < 300
                AND d.auction_end_at IS NULL
                AND d.source::text NOT IN ('copart','iaa','adesa','manheim','acv','gov_auction','repo_network')
           THEN 'price_below_300' END,
      CASE WHEN d.ask_price > 500000 THEN 'price_above_500k' END,
      CASE WHEN d.mileage < 0 THEN 'mileage_negative' END,
      CASE WHEN d.mileage > 500000 THEN 'mileage_above_500k' END,
      CASE WHEN (d.mileage >= 0 AND d.mileage < 100 AND d.year > 0
                 AND extract(year FROM now())::int - d.year >= 3)
             OR (d.mileage <= 500000 AND d.year > 0
                 AND d.mileage > 150000 * greatest(1, extract(year FROM now())::int - d.year + 1))
           THEN 'mileage_implausible' END,
      CASE WHEN d.year > 0 AND d.year < 1950 THEN 'year_before_1950' END,
      CASE WHEN d.year > extract(year FROM now())::int + 1 THEN 'year_after_next_model_year' END,
      CASE WHEN NOT (d.year > 0 AND d.year < 1981)
                AND nullif(btrim(d.vin), '') IS NOT NULL
                AND upper(regexp_replace(d.vin, '[\s-]', '', 'g')) !~ '^[A-HJ-NPR-Z0-9]{17}$'
           THEN 'vin_bad_format' END,
      CASE WHEN NOT (d.year > 0 AND d.year < 1981)
                AND upper(regexp_replace(coalesce(d.vin, ''), '[\s-]', '', 'g')) ~ '^[A-HJ-NPR-Z0-9]{17}$'
                AND NOT public.vin_check_digit_ok(d.vin)
           THEN 'vin_check_digit' END,
      CASE WHEN d.year > 0 AND public.vin_check_digit_ok(d.vin)
                AND least(abs(d.year - (1980 + yc.i)), abs(d.year - (2010 + yc.i))) > 1
           THEN 'year_vin_mismatch' END
    ], NULL) AS flags,
    (CASE WHEN coalesce(cardinality(array_remove(d.images, '')), 0) > 0 THEN 25 ELSE 0 END
     + CASE WHEN upper(regexp_replace(coalesce(d.vin, ''), '[\s-]', '', 'g')) ~ '^[A-HJ-NPR-Z0-9]{17}$' THEN 20 ELSE 0 END
     + CASE WHEN d.mileage >= 0 THEN 15 ELSE 0 END
     + CASE WHEN d.ask_price > 0 THEN 15 ELSE 0 END
     + CASE WHEN d.condition IS NOT NULL THEN 15 ELSE 0 END
     + CASE WHEN coalesce(d.location_zip, '') ~ '\m\d{5}\M'
              OR (nullif(btrim(d.location_city), '') IS NOT NULL AND nullif(btrim(d.location_state), '') IS NOT NULL) THEN 10
            WHEN nullif(btrim(d.location_state), '') IS NOT NULL THEN 5
            ELSE 0 END)::smallint AS score
  FROM public.deals d
  LEFT JOIN LATERAL (
    SELECT nullif(strpos('ABCDEFGHJKLMNPRSTVWXY123456789',
                         substr(upper(regexp_replace(coalesce(d.vin, ''), '[\s-]', '', 'g')), 10, 1)), 0) - 1 AS i
  ) yc ON true
)
UPDATE public.deals d
SET quality_flags = nullif(c.flags, '{}'::text[]),
    completeness = c.score
FROM calc c
WHERE c.id = d.id
  AND (d.quality_flags IS DISTINCT FROM nullif(c.flags, '{}'::text[])
       OR d.completeness IS DISTINCT FROM c.score);

-- Flagged rows leave scoring now, not on their next re-ingest (same fields upsertDeals clears).
UPDATE public.deals
SET profit_score = NULL,
    true_net_profit = NULL,
    recommended_max_bid = NULL,
    sell_estimate = NULL,
    is_arbitrage_opportunity = false,
    deal_verdict = 'pass'
WHERE quality_flags IS NOT NULL
  AND (profit_score IS NOT NULL OR true_net_profit IS NOT NULL OR is_arbitrage_opportunity
       OR deal_verdict IS DISTINCT FROM 'pass');

-- Guard: both columns stay server-only.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated') LOOP
    IF has_column_privilege(r.rolname, 'public.deals', 'quality_flags', 'SELECT')
       OR has_column_privilege(r.rolname, 'public.deals', 'completeness', 'SELECT') THEN
      RAISE EXCEPTION 'deals.quality_flags/completeness must not be selectable by %', r.rolname;
    END IF;
  END LOOP;
END $$;

COMMIT;
