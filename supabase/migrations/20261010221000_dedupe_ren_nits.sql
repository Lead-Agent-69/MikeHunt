-- Ren #307 nits (stacked on 20261010220000; check-free, no new column or index).
--
-- dedupe_deals (same signature, SECURITY INVOKER, EXECUTE stays service_role only):
--   P2  VIN-conflict rows are cleared exactly like a sanity-flagged row (20261010210000): profit_score,
--       true_net_profit, recommended_max_bid, sell_estimate NULL, is_arbitrage_opportunity false,
--       deal_verdict 'pass'. Re-applied whenever a conflict row carries any of them again.
--   P3  The function-level SET statement_timeout is dropped: a function's SET only applies inside it and
--       the timeout is checked per top-level statement, so it never limited anything. Callers set
--       their own timeout (PostgREST role timeout / migration session).
--   P3  VIN key = upper(regexp_replace(vin, '[\s-]', '', 'g')) everywhere (group key, fuzzy VIN, and
--       detect_duplicates_by_vin's filter), the same normalization vin_check_digit_ok and
--       lib/vehicle/vin.ts normalizeVin use. Before, '1FT...-GED...' passed the check but formed its
--       own group.
--   P3  Converges: a second full pass writes 0 rows. (1) step 1 no longer clears a single-row VIN
--       group's fuzzy link (the fuzzy step re-linked it every pass); (2) the fuzzy step never links a
--       row that already has copies (no chains for step 3 to release next pass); (3) the fuzzy link
--       step repeats inside one call until a round links nothing (cap 50 rounds), instead of leaving
--       one more level of a lookalike cluster for every later pass. Result gains 'fuzzy_rounds'.
-- get_market_pulse: EXECUTE revoked from PUBLIC / anon / authenticated, granted to service_role.
--   Every caller (app/api/market/pulse, app/api/market/ticker, app/api/mcp) uses
--   createServerComponentClient(), which is the service-role client. Nothing in the browser calls it.
-- Data: one full dedupe pass (applies the VIN-conflict clear and the normalized VIN key).

BEGIN;

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.dedupe_deals(p_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
SET client_min_messages TO 'warning'
AS $$
DECLARE
  v_vin_linked integer := 0;
  v_conflicts integer := 0;
  v_fuzzy integer := 0;
  v_released integer := 0;
  v_promoted integer := 0;
  v_round integer := 0;
  v_n integer := 0;
BEGIN
  -- ── 1. Exact VIN ────────────────────────────────────────────────────────────────────────────
  CREATE TEMP TABLE IF NOT EXISTS _dd_vin (vin text PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _dd_vin;
  INSERT INTO _dd_vin
  SELECT DISTINCT upper(regexp_replace(d.vin, '[\s-]', '', 'g'))
  FROM public.deals d
  WHERE public.vin_check_digit_ok(d.vin) -- a bad check digit is never a dedup key
    AND (p_ids IS NULL OR d.id = ANY(p_ids));

  -- Groups (all rows of each touched VIN, active or not).
  CREATE TEMP TABLE IF NOT EXISTS _dd_grp (
    id uuid PRIMARY KEY, vin text, conflict boolean, canonical uuid, n integer
  ) ON COMMIT DROP;
  TRUNCATE _dd_grp;
  INSERT INTO _dd_grp
  SELECT d.id, v.vin, false,
         first_value(d.id) OVER (PARTITION BY v.vin
                                 ORDER BY coalesce(d.active, false) DESC, d.first_seen_at ASC, d.id ASC),
         count(*) OVER (PARTITION BY v.vin)
  FROM public.deals d
  JOIN _dd_vin v ON upper(regexp_replace(d.vin, '[\s-]', '', 'g')) = v.vin;
  -- Conflict = the group disagrees on make, or on year by 2+ (model year vs listed year is often off
  -- by one for the same car). count(DISTINCT) can't be a window, so compute it per group here.
  UPDATE _dd_grp g SET conflict = c.conflict
  FROM (
    SELECT g2.vin,
           (count(DISTINCT lower(btrim(d.make))) > 1 OR max(d.year) - min(d.year) >= 2) AS conflict
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
        -- Same clear as a sanity-flagged row (20261010210000 / upsertDeals): never scored, never a GO.
        profit_score = NULL,
        true_net_profit = NULL,
        recommended_max_bid = NULL,
        sell_estimate = NULL,
        is_arbitrage_opportunity = false,
        deal_verdict = 'pass'
    FROM _dd_grp g
    WHERE g.id = d.id AND g.conflict
      AND (NOT ('vin_conflict' = ANY(coalesce(d.quality_flags, '{}')))
           OR d.duplicate_confidence >= 1
           OR d.profit_score IS NOT NULL OR d.true_net_profit IS NOT NULL
           OR d.recommended_max_bid IS NOT NULL OR d.sell_estimate IS NOT NULL
           OR coalesce(d.is_arbitrage_opportunity, false)
           OR d.deal_verdict IS DISTINCT FROM 'pass')
    RETURNING 1
  ) SELECT count(*) INTO v_conflicts FROM f;

  -- A group that no longer conflicts loses the flag.
  UPDATE public.deals d
  SET quality_flags = nullif(array_remove(d.quality_flags, 'vin_conflict'), '{}')
  FROM _dd_grp g
  WHERE g.id = d.id AND NOT g.conflict AND 'vin_conflict' = ANY(coalesce(d.quality_flags, '{}'));

  -- Clean groups: canonical keeps NULL, every other row links to it. A single-row VIN "group" keeps a
  -- fuzzy link (confidence < 1) it already has: clearing it here made the fuzzy step re-link the same
  -- row on every full pass (Ren #307 P3, 26 rows churned per pass). A multi-row group's canonical drops
  -- any link; the fuzzy step never links a row that already has copies, so it stays NULL.
  WITH l AS (
    UPDATE public.deals d
    SET duplicate_of_id = CASE WHEN d.id = g.canonical THEN NULL ELSE g.canonical END,
        duplicate_confidence = CASE WHEN d.id = g.canonical THEN NULL ELSE 1.000 END
    FROM _dd_grp g
    WHERE g.id = d.id AND NOT g.conflict
      AND NOT (d.id = g.canonical AND g.n = 1 AND d.duplicate_confidence < 1)
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

  -- Canonical deleted (retention hard-delete): its copies are released; for VIN groups step 1 has
  -- already re-pointed them at the oldest remaining copy, so this only frees fuzzy copies, and the
  -- fuzzy pass below re-links them to each other with the oldest as canonical.
  WITH x AS (
    UPDATE public.deals d
    SET duplicate_of_id = NULL, duplicate_confidence = NULL
    WHERE d.duplicate_of_id IS NOT NULL
      AND (p_ids IS NULL OR d.id = ANY(p_ids))
      AND NOT EXISTS (SELECT 1 FROM public.deals c WHERE c.id = d.duplicate_of_id)
    RETURNING 1
  ) SELECT v_promoted + count(*) INTO v_promoted FROM x;

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
         CASE WHEN public.vin_check_digit_ok(d.vin) THEN upper(regexp_replace(d.vin, '[\s-]', '', 'g')) END,
         d.images[1], d.title, d.first_seen_at
  FROM public.deals d
  WHERE coalesce(d.active, false)
    AND d.duplicate_of_id IS NULL
    AND d.quality_flags IS NULL
    AND d.mileage >= 1000
    AND d.ask_price > 0
    AND d.location_state IS NOT NULL;
  -- A row that already has copies is never linked as a duplicate itself (no chains, so nothing for
  -- step 3 to release and re-link on the next pass). It can still be the canonical side of a pair.
  CREATE TEMP TABLE IF NOT EXISTS _dd_has_copies (id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _dd_has_copies;
  INSERT INTO _dd_has_copies
  SELECT DISTINCT d.duplicate_of_id FROM public.deals d WHERE d.duplicate_of_id IS NOT NULL
  ON CONFLICT DO NOTHING;

  -- Repeat the set-based link step until it links nothing (bounded). One round can't link a row
  -- whose best canonical is itself being linked in that round (no chains), so a cluster of 3+
  -- lookalikes used to need one more full pass per level; looping here means the NEXT call links 0.
  CREATE TEMP TABLE IF NOT EXISTS _dd_linked (id uuid PRIMARY KEY, canon uuid) ON COMMIT DROP;
  LOOP
  v_round := v_round + 1;
  TRUNCATE _dd_linked;
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
    FROM pairs p
    WHERE NOT EXISTS (SELECT 1 FROM _dd_has_copies h WHERE h.id = p.dup_id)
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
    RETURNING d.id, s.canon_id
  )
  INSERT INTO _dd_linked SELECT * FROM u;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_fuzzy := v_fuzzy + v_n;
  EXIT WHEN v_n = 0;
  IF v_round >= 50 THEN
    RAISE WARNING 'dedupe_deals: fuzzy link step stopped after % rounds', v_round;
    EXIT;
  END IF;
  DELETE FROM _dd_cand c USING _dd_linked l WHERE c.id = l.id;
  INSERT INTO _dd_has_copies SELECT DISTINCT canon FROM _dd_linked ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN jsonb_build_object(
    'vin_linked', v_vin_linked,
    'vin_conflict_rows', v_conflicts,
    'fuzzy_linked', v_fuzzy,
    'fuzzy_released', v_released,
    'promoted', v_promoted,
    'fuzzy_rounds', v_round
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.detect_duplicates_by_vin(vin_filter text[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  IF vin_filter IS NULL THEN
    PERFORM public.dedupe_deals(NULL);
  ELSE
    PERFORM public.dedupe_deals(ARRAY(
      SELECT d.id FROM public.deals d
      WHERE upper(regexp_replace(d.vin, '[\s-]', '', 'g')) IN (SELECT upper(regexp_replace(v, '[\s-]', '', 'g')) FROM unnest(vin_filter) AS v)
    ));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.detect_duplicates_by_vin(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.detect_duplicates_by_vin(text[]) TO service_role;

REVOKE ALL ON FUNCTION public.dedupe_deals(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dedupe_deals(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.get_market_pulse() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_market_pulse() TO service_role;

SELECT public.dedupe_deals(NULL);

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_function_privilege(r, 'public.dedupe_deals(uuid[])', 'EXECUTE')
       OR has_function_privilege(r, 'public.detect_duplicates_by_vin(text[])', 'EXECUTE')
       OR has_function_privilege(r, 'public.get_market_pulse()', 'EXECUTE') THEN
      RAISE EXCEPTION 'dedupe_deals / detect_duplicates_by_vin / get_market_pulse must be service_role only (%)', r;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.dedupe_deals(uuid[])'::regprocedure
             AND (prosecdef OR proconfig::text LIKE '%statement_timeout%')) THEN
    RAISE EXCEPTION 'dedupe_deals must be SECURITY INVOKER with no function-level statement_timeout';
  END IF;
  IF EXISTS (SELECT 1 FROM public.deals
             WHERE 'vin_conflict' = ANY(coalesce(quality_flags, '{}'))
               AND (profit_score IS NOT NULL OR true_net_profit IS NOT NULL OR recommended_max_bid IS NOT NULL
                    OR sell_estimate IS NOT NULL OR coalesce(is_arbitrage_opportunity, false)
                    OR deal_verdict IS DISTINCT FROM 'pass')) THEN
    RAISE EXCEPTION 'vin_conflict rows must carry no score, profit, max bid or GO';
  END IF;
END $$;

COMMIT;
