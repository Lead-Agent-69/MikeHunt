-- Data quality, part 2: cross-source dedup on deals (gap audit section I.1/I.2). Stacked on
-- 20261010210000 (uses deals.quality_flags for the VIN-conflict flag).
--
-- Model: one canonical row per car, every other copy LINKED to it through the existing
-- deals.duplicate_of_id (+ duplicate_confidence). Nothing is deleted or deactivated, so every
-- source's listing and link is kept. Readers count / rank canonical rows only
-- (duplicate_of_id IS NULL) and show the linked copies as "also on".
--
-- public.dedupe_deals(p_ids uuid[] DEFAULT NULL) RETURNS jsonb
--   p_ids = the rows a scrape batch just wrote (NULL = full pass). Three steps:
--   1. Exact VIN (17-char, normalized upper). Canonical = earliest-seen ACTIVE row (stable; when it
--      goes inactive the next active copy is promoted). confidence 1.000.
--      Conflict: the same VIN on rows with different model years or makes is NOT merged. Every row
--      in the group gets 'vin_conflict' in quality_flags (keeps them out of scoring) and any VIN link
--      among them is cleared.
--   2. Fuzzy, for active rows without a usable VIN match, CROSS-HOST only (a dealer's own two
--      URLs for the same stock are only merged by VIN): same year, make, alnum-normalized model,
--      compatible trim (equal, or one side blank), price within 3%, both mileages >= 1,000 and
--      within 2% (new-car 5-12 mile listings are never fuzzy-matched), same state and same zip3 or
--      city. Two different valid VINs never match. confidence 0.950 when the first photo URL is
--      identical or titles are trigram-similar (>= 0.6), else 0.850. Not sanity-flagged rows only.
--   3. Fuzzy links whose price / mileage drifted apart, or whose canonical went inactive, are
--      re-checked and released.
--
-- Also: discover_deals returns duplicate_of_id (Discover groups copies under one card), and
-- count_by_state / get_market_pulse count canonical rows only. Signatures and grants unchanged.
--
-- Free tier: no new columns, no new index. Joins use deals_vin_idx and idx_deals_make_model_year.
-- A full pass over hosted (5k rows) runs in well under a second. Backfill: one full pass at the end.
-- Privileges: dedupe_deals is SECURITY INVOKER and EXECUTE is service_role only.

BEGIN;

CREATE OR REPLACE FUNCTION public.dedupe_deals(p_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
SET statement_timeout TO '30s'
SET client_min_messages TO 'warning'
AS $$
DECLARE
  v_vin_linked integer := 0;
  v_conflicts integer := 0;
  v_fuzzy integer := 0;
  v_released integer := 0;
  v_promoted integer := 0;
BEGIN
  -- ── 1. Exact VIN ────────────────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _dd_vin (vin text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _dd_vin;
  INSERT INTO _dd_vin
  SELECT DISTINCT upper(btrim(d.vin))
  FROM public.deals d
  WHERE upper(btrim(d.vin)) ~ '^[A-HJ-NPR-Z0-9]{17}$'
    AND (p_ids IS NULL OR d.id = ANY(p_ids));

  -- Groups (all rows of each touched VIN, active or not).
  CREATE TEMP TABLE IF NOT EXISTS _dd_grp (
    id uuid PRIMARY KEY, vin text, conflict boolean, canonical uuid
  ) ON COMMIT DROP;
  TRUNCATE _dd_grp;
  INSERT INTO _dd_grp
  SELECT d.id, v.vin, false,
         first_value(d.id) OVER (PARTITION BY v.vin
                                 ORDER BY coalesce(d.active, false) DESC, d.first_seen_at ASC, d.id ASC)
  FROM public.deals d
  JOIN _dd_vin v ON upper(btrim(d.vin)) = v.vin;
  -- Conflict = the group disagrees on model year or make (count(DISTINCT) can't be a window).
  UPDATE _dd_grp g SET conflict = c.conflict
  FROM (
    SELECT g2.vin,
           (count(DISTINCT d.year) > 1 OR count(DISTINCT lower(btrim(d.make))) > 1) AS conflict
    FROM _dd_grp g2 JOIN public.deals d ON d.id = g2.id
    GROUP BY g2.vin
  ) c
  WHERE c.vin = g.vin;

  -- Conflicts: flag, never merge; clear VIN links inside the group.
  WITH f AS (
    UPDATE public.deals d
    SET quality_flags = CASE WHEN 'vin_conflict' = ANY(coalesce(d.quality_flags, '{}'))
                             THEN d.quality_flags
                             ELSE array_append(coalesce(d.quality_flags, '{}'), 'vin_conflict') END,
        duplicate_of_id = CASE WHEN d.duplicate_confidence >= 1 THEN NULL ELSE d.duplicate_of_id END,
        duplicate_confidence = CASE WHEN d.duplicate_confidence >= 1 THEN NULL ELSE d.duplicate_confidence END,
        profit_score = NULL,
        is_arbitrage_opportunity = false
    FROM _dd_grp g
    WHERE g.id = d.id AND g.conflict
      AND (NOT ('vin_conflict' = ANY(coalesce(d.quality_flags, '{}')))
           OR d.duplicate_confidence >= 1)
    RETURNING 1
  ) SELECT count(*) INTO v_conflicts FROM f;

  -- A group that no longer conflicts loses the flag.
  UPDATE public.deals d
  SET quality_flags = nullif(array_remove(d.quality_flags, 'vin_conflict'), '{}')
  FROM _dd_grp g
  WHERE g.id = d.id AND NOT g.conflict AND 'vin_conflict' = ANY(coalesce(d.quality_flags, '{}'));

  -- Clean groups: canonical keeps NULL, every other row links to it.
  WITH l AS (
    UPDATE public.deals d
    SET duplicate_of_id = CASE WHEN d.id = g.canonical THEN NULL ELSE g.canonical END,
        duplicate_confidence = CASE WHEN d.id = g.canonical THEN NULL ELSE 1.000 END
    FROM _dd_grp g
    WHERE g.id = d.id AND NOT g.conflict
      AND (d.duplicate_of_id IS DISTINCT FROM CASE WHEN d.id = g.canonical THEN NULL ELSE g.canonical END)
    RETURNING (d.id <> g.canonical) AS linked
  ) SELECT count(*) FILTER (WHERE linked) INTO v_vin_linked FROM l;

  -- Rows that pointed at a VIN-group member which is no longer canonical follow the new canonical.
  UPDATE public.deals d
  SET duplicate_of_id = g.canonical
  FROM _dd_grp g
  WHERE d.duplicate_of_id = g.id AND g.id <> g.canonical AND NOT g.conflict AND d.id <> g.canonical;

  -- ── 3 (first). Release fuzzy links that no longer hold ─────────────────────────────────────
  WITH r AS (
    UPDATE public.deals d
    SET duplicate_of_id = NULL, duplicate_confidence = NULL
    FROM public.deals c
    WHERE c.id = d.duplicate_of_id
      AND d.duplicate_confidence < 1
      AND (p_ids IS NULL OR d.id = ANY(p_ids) OR c.id = ANY(p_ids))
      AND (
        NOT coalesce(c.active, false)
        OR c.duplicate_of_id IS NOT NULL
        OR abs(d.ask_price - c.ask_price) > 0.03 * greatest(d.ask_price, c.ask_price)
        OR d.mileage IS NULL OR c.mileage IS NULL
        OR abs(d.mileage - c.mileage) > 0.02 * greatest(d.mileage, c.mileage)
        OR d.quality_flags IS NOT NULL OR c.quality_flags IS NOT NULL
      )
    RETURNING 1
  ) SELECT count(*) INTO v_released FROM r;

  -- Active copies whose canonical went inactive (any basis) become canonical themselves; step 1
  -- already re-picked VIN groups, so this only catches fuzzy chains.
  WITH p AS (
    UPDATE public.deals d
    SET duplicate_of_id = NULL, duplicate_confidence = NULL
    FROM public.deals c
    WHERE c.id = d.duplicate_of_id AND coalesce(d.active, false) AND NOT coalesce(c.active, false)
      AND (p_ids IS NULL OR d.id = ANY(p_ids) OR c.id = ANY(p_ids))
    RETURNING 1
  ) SELECT count(*) INTO v_promoted FROM p;

  -- ── 2. Fuzzy cross-source ──────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _dd_cand (
    id uuid PRIMARY KEY, host text, year smallint, mk text, md text, tr text,
    price integer, miles integer, st text, z3 text, city text, vin text, img text, title text,
    first_seen timestamptz
  ) ON COMMIT DROP;
  TRUNCATE _dd_cand;
  INSERT INTO _dd_cand
  SELECT d.id,
         lower(regexp_replace(substring(d.source_url FROM '^[a-z]+://([^/:?#]+)'), '^www\.', '')),
         d.year, lower(btrim(d.make)), lower(regexp_replace(d.model, '[^a-zA-Z0-9]', '', 'g')),
         lower(regexp_replace(coalesce(d.trim, ''), '[^a-zA-Z0-9]', '', 'g')),
         d.ask_price, d.mileage, d.location_state::text, left(substring(d.location_zip FROM '\d{5}'), 3),
         lower(btrim(d.location_city)),
         CASE WHEN upper(btrim(d.vin)) ~ '^[A-HJ-NPR-Z0-9]{17}$' THEN upper(btrim(d.vin)) END,
         d.images[1], d.title, d.first_seen_at
  FROM public.deals d
  WHERE coalesce(d.active, false)
    AND d.duplicate_of_id IS NULL
    AND d.quality_flags IS NULL
    AND d.mileage >= 1000
    AND d.ask_price > 0
    AND d.location_state IS NOT NULL;

  WITH pairs AS (
    SELECT a.id AS a_id, b.id AS b_id,
           CASE WHEN (a.img IS NOT NULL AND a.img = b.img)
                  OR similarity(coalesce(a.title, ''), coalesce(b.title, '')) >= 0.6
                THEN 0.950 ELSE 0.850 END AS conf,
           -- the newer row links to the older one
           CASE WHEN (a.first_seen, a.id) > (b.first_seen, b.id) THEN a.id ELSE b.id END AS dup_id,
           CASE WHEN (a.first_seen, a.id) > (b.first_seen, b.id) THEN b.id ELSE a.id END AS canon_id
    FROM _dd_cand a
    JOIN _dd_cand b
      ON b.id <> a.id
     AND b.year = a.year AND b.mk = a.mk AND b.md = a.md AND b.st = a.st
     AND b.host IS DISTINCT FROM a.host
     AND (a.tr = '' OR b.tr = '' OR a.tr = b.tr)
     AND abs(a.price - b.price) <= 0.03 * greatest(a.price, b.price)
     AND abs(a.miles - b.miles) <= 0.02 * greatest(a.miles, b.miles)
     AND ((a.z3 IS NOT NULL AND a.z3 = b.z3) OR (a.city IS NOT NULL AND a.city = b.city))
     AND (a.vin IS NULL OR b.vin IS NULL OR a.vin = b.vin)
    WHERE (p_ids IS NULL OR a.id = ANY(p_ids))
      AND NOT (a.vin IS NOT NULL AND a.vin = b.vin) -- exact VIN pairs were handled in step 1
  ),
  -- one link per duplicate: its best (highest confidence, then oldest) canonical
  best AS (
    SELECT DISTINCT ON (dup_id) dup_id, canon_id, conf
    FROM pairs
    ORDER BY dup_id, conf DESC, canon_id
  ),
  -- never link to a row that is itself being linked in this pass (no chains)
  safe AS (
    SELECT b.* FROM best b
    WHERE NOT EXISTS (SELECT 1 FROM best x WHERE x.dup_id = b.canon_id)
  ),
  u AS (
    UPDATE public.deals d
    SET duplicate_of_id = s.canon_id, duplicate_confidence = s.conf
    FROM safe s
    WHERE d.id = s.dup_id AND d.duplicate_of_id IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_fuzzy FROM u;

  RETURN jsonb_build_object(
    'vin_linked', v_vin_linked,
    'vin_conflict_rows', v_conflicts,
    'fuzzy_linked', v_fuzzy,
    'fuzzy_released', v_released,
    'promoted', v_promoted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.dedupe_deals(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedupe_deals(uuid[]) TO service_role;

COMMENT ON FUNCTION public.dedupe_deals(uuid[]) IS
  'Cross-source dedup: exact VIN, then fuzzy (year/make/model/trim, price 3%, miles 2%, zip3/city). Links copies via duplicate_of_id; never deletes. VIN conflicts are flagged, not merged.';

-- Discover groups linked copies under one card: also return duplicate_of_id (same signature).
CREATE OR REPLACE FUNCTION public.discover_deals(p_state text DEFAULT NULL::text, p_max_price numeric DEFAULT 0, p_limit integer DEFAULT 24000, p_states text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT id, source, source_url, title, year, make, model, trim, vin, mileage, condition, damage_type,
           ask_price, sell_estimate, mmr_value, deal_analysis, profit_score, true_net_profit,
           recommended_max_bid, deal_verdict, location_city, location_state, images, last_seen_at,
           first_seen_at, auction_end_at, options, duplicate_of_id, quality_flags
    FROM public.deals
    WHERE active AND ask_price > 0
      AND (p_state IS NULL OR location_state = p_state)
      AND (p_states IS NULL OR location_state = ANY(p_states))
      AND (p_max_price = 0 OR ask_price <= p_max_price)
    ORDER BY last_seen_at DESC, id ASC
    LIMIT p_limit
  ) t;
$function$;

-- Counts: canonical rows only.
CREATE OR REPLACE FUNCTION public.count_by_state(p_table text, p_col text)
 RETURNS TABLE(state text, n bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_table = 'deals' AND p_col = 'location_state' THEN
    RETURN QUERY
      SELECT d.location_state::text, count(*)::bigint
      FROM public.deals d
      WHERE d.active AND d.location_state IS NOT NULL AND d.duplicate_of_id IS NULL
      GROUP BY d.location_state;
  ELSIF p_table = 'properties' AND p_col = 'state' THEN
    RETURN QUERY
      SELECT p.state::text, count(*)::bigint
      FROM public.properties p WHERE p.active AND p.state IS NOT NULL
      GROUP BY p.state;
  ELSE
    RETURN;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_market_pulse()
 RETURNS TABLE(make text, model text, go_deals bigint, avg_profit numeric, avg_days integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT
    d.make,
    d.model,
    COUNT(*) FILTER (WHERE d.deal_verdict = 'go')                              AS go_deals,
    ROUND(AVG(d.true_net_profit) FILTER (WHERE d.deal_verdict = 'go'), 0)      AS avg_profit,
    ROUND(AVG(EXTRACT(DAY FROM (NOW() - d.first_seen_at))))::INT               AS avg_days
  FROM public.deals d
  WHERE d.active = true AND d.make IS NOT NULL AND d.model IS NOT NULL
    AND d.duplicate_of_id IS NULL
  GROUP BY d.make, d.model
  HAVING COUNT(*) FILTER (WHERE d.deal_verdict = 'go') > 3
  ORDER BY go_deals DESC
  LIMIT 12;
$function$;

-- Backfill: one full pass.
SELECT public.dedupe_deals(NULL);

-- Guard: client roles cannot run the dedup writer.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.dedupe_deals(uuid[])', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.dedupe_deals(uuid[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'dedupe_deals must be service_role only';
  END IF;
END $$;

COMMIT;
