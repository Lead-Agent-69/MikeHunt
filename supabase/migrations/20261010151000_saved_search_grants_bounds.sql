-- Saved searches + alert inbox: client grants and value bounds (Ren, live hole on hosted PG17).
--
-- Before this migration both tables carry the Supabase default table grants for anon and
-- authenticated (arwdxtm). RLS ("own_searches" / "own_inbox": user_id = auth.uid()) scopes rows to
-- the owner, but NOT columns or values, so a signed-in client could write
--   * notify_sms = true      -> uncapped SMS on every match (pipeline sends SMS when notify_sms)
--   * last_run_at = 2099     -> server-owned bookkeeping
--   * a 100k-character name, thousands of searches -> digest / alert flood
-- and could INSERT/UPDATE/DELETE its own user_feed_inbox rows directly.
--
-- What this does (idempotent; a re-run converges to the same state):
--   1. anon: no privileges at all on either table.
--   2. user_feed_inbox: authenticated is SELECT-only (writes are the pipeline and /api/alerts*,
--      all service-role). digest_sent_at (#317) lives on this table and is therefore server-only.
--   3. user_saved_searches: authenticated keeps SELECT and DELETE (RLS still applies); INSERT and
--      UPDATE are column-limited to the user-editable columns below. id, notify_sms, last_run_at
--      and created_at stay server-only (defaults apply on insert). Any column added later is
--      server-only until a migration grants it explicitly.
--      match_precision / delivery_mode are added by May's #317, which must sort AFTER this file.
--      If they already exist when this runs they are granted here; otherwise #317 must
--      `GRANT INSERT (match_precision, delivery_mode), UPDATE (match_precision, delivery_mode)
--       ON public.user_saved_searches TO authenticated;` (enforced by the guard test).
--   4. CHECK bounds (NOT VALID, then VALIDATE; hosted had 0 rows on 2026-10-10 05:20 CT, read-only check).
--   5. A BEFORE INSERT/UPDATE trigger: years <= current year + 2 (CHECK can't call now()), and at
--      most 50 searches per user (advisory lock per user, so concurrent inserts can't race past it).
--   6. Self-check: fails and rolls back unless the privilege/constraint/trigger shape is exact.
-- service_role is untouched. Requires 20261010150000 (state/lane/seller_type/title_type).

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
     WHERE attrelid = 'public.user_saved_searches'::regclass
       AND attname = 'title_type' AND attnum > 0 AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION '20261010151000 needs 20261010150000 (user_saved_searches.state/lane/seller_type/title_type) first';
  END IF;
END $$;

-- 1 + 2 + 3: privileges. REVOKE ALL at table level also drops every column-level grant, so a re-run
-- starts from a clean slate before the grants below are (re)issued.
REVOKE ALL ON TABLE public.user_saved_searches FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_feed_inbox FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.user_feed_inbox TO authenticated;
GRANT SELECT, DELETE ON TABLE public.user_saved_searches TO authenticated;

DO $$
DECLARE
  editable text[] := ARRAY[
    'user_id', 'name', 'make', 'model', 'state', 'lane', 'seller_type', 'title_type',
    'min_year', 'max_year', 'max_price', 'target_profit', 'max_distance_miles', 'min_count',
    'match_precision', 'delivery_mode', 'notify_email', 'is_active', 'require_go'];
  cols text;
BEGIN
  SELECT string_agg(quote_ident(att.attname), ', ' ORDER BY att.attnum)
    INTO cols
    FROM pg_attribute att
   WHERE att.attrelid = 'public.user_saved_searches'::regclass
     AND att.attnum > 0 AND NOT att.attisdropped
     AND att.attname = ANY (editable);
  EXECUTE format('GRANT INSERT (%s), UPDATE (%s) ON TABLE public.user_saved_searches TO authenticated', cols, cols);
END $$;

-- 4: value bounds.
ALTER TABLE public.user_saved_searches
  DROP CONSTRAINT IF EXISTS user_saved_searches_name_len,
  DROP CONSTRAINT IF EXISTS user_saved_searches_text_len,
  DROP CONSTRAINT IF EXISTS user_saved_searches_year_range,
  DROP CONSTRAINT IF EXISTS user_saved_searches_price_range,
  DROP CONSTRAINT IF EXISTS user_saved_searches_profit_range,
  DROP CONSTRAINT IF EXISTS user_saved_searches_distance_range,
  DROP CONSTRAINT IF EXISTS user_saved_searches_min_count_range;

ALTER TABLE public.user_saved_searches
  ADD CONSTRAINT user_saved_searches_name_len
    CHECK (char_length(name) BETWEEN 1 AND 120) NOT VALID,
  ADD CONSTRAINT user_saved_searches_text_len
    CHECK (char_length(make) <= 64 AND char_length(model) <= 64
       AND char_length(state) <= 64 AND char_length(lane) <= 64
       AND char_length(seller_type) <= 64 AND char_length(title_type) <= 64) NOT VALID,
  -- Fixed upper bound here; the trigger enforces "current year + 2".
  ADD CONSTRAINT user_saved_searches_year_range
    CHECK (min_year BETWEEN 1900 AND 2100 AND max_year BETWEEN 1900 AND 2100
       AND min_year <= max_year) NOT VALID,
  ADD CONSTRAINT user_saved_searches_price_range
    CHECK (max_price BETWEEN 0 AND 10000000) NOT VALID,
  ADD CONSTRAINT user_saved_searches_profit_range
    CHECK (target_profit BETWEEN -1000000 AND 1000000) NOT VALID,
  ADD CONSTRAINT user_saved_searches_distance_range
    CHECK (max_distance_miles BETWEEN 0 AND 3000) NOT VALID,
  ADD CONSTRAINT user_saved_searches_min_count_range
    CHECK (min_count BETWEEN 1 AND 50) NOT VALID;
-- (A NULL operand makes a CHECK pass, so NULL = "any" keeps working for every optional column.)

ALTER TABLE public.user_saved_searches VALIDATE CONSTRAINT user_saved_searches_name_len;
ALTER TABLE public.user_saved_searches VALIDATE CONSTRAINT user_saved_searches_text_len;
ALTER TABLE public.user_saved_searches VALIDATE CONSTRAINT user_saved_searches_year_range;
ALTER TABLE public.user_saved_searches VALIDATE CONSTRAINT user_saved_searches_price_range;
ALTER TABLE public.user_saved_searches VALIDATE CONSTRAINT user_saved_searches_profit_range;
ALTER TABLE public.user_saved_searches VALIDATE CONSTRAINT user_saved_searches_distance_range;
ALTER TABLE public.user_saved_searches VALIDATE CONSTRAINT user_saved_searches_min_count_range;

-- 5: year ceiling + 50-per-user cap. SECURITY DEFINER so the count sees every row of that user
-- regardless of the caller's RLS view; empty search_path, everything schema-qualified.
CREATE OR REPLACE FUNCTION public.user_saved_searches_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  max_year_allowed integer := extract(year FROM now())::integer + 2;
  n integer;
BEGIN
  IF NEW.min_year > max_year_allowed OR NEW.max_year > max_year_allowed THEN
    RAISE EXCEPTION 'saved search year must be <= %', max_year_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('user_saved_searches:' || NEW.user_id::text, 0));
    SELECT count(*) INTO n
      FROM public.user_saved_searches s
     WHERE s.user_id = NEW.user_id
       AND s.id IS DISTINCT FROM NEW.id;
    IF n >= 50 THEN
      RAISE EXCEPTION 'saved search limit reached (50 per user)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION public.user_saved_searches_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS user_saved_searches_guard ON public.user_saved_searches;
CREATE TRIGGER user_saved_searches_guard
  BEFORE INSERT OR UPDATE ON public.user_saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.user_saved_searches_guard();

-- 6: self-check.
DO $$
DECLARE
  editable text[] := ARRAY[
    'user_id', 'name', 'make', 'model', 'state', 'lane', 'seller_type', 'title_type',
    'min_year', 'max_year', 'max_price', 'target_profit', 'max_distance_miles', 'min_count',
    'match_precision', 'delivery_mode', 'notify_email', 'is_active', 'require_go'];
  server_only text[] := ARRAY['id', 'notify_sms', 'last_run_at', 'created_at'];
  t text;
  p text;
  c record;
  want boolean;
  cons text[] := ARRAY[
    'user_saved_searches_name_len', 'user_saved_searches_text_len', 'user_saved_searches_year_range',
    'user_saved_searches_price_range', 'user_saved_searches_profit_range',
    'user_saved_searches_distance_range', 'user_saved_searches_min_count_range'];
BEGIN
  -- anon: nothing, table or column level.
  FOREACH t IN ARRAY ARRAY['public.user_saved_searches', 'public.user_feed_inbox'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
      IF has_table_privilege('anon', t, p) THEN
        RAISE EXCEPTION 'self-check: anon still has % on %', p, t;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege('anon', t, p) THEN
        RAISE EXCEPTION 'self-check: anon has column-level % on %', p, t;
      END IF;
    END LOOP;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = t::regclass) THEN
      RAISE EXCEPTION 'self-check: RLS is off on %', t;
    END IF;
  END LOOP;

  -- user_feed_inbox: authenticated SELECT only.
  IF NOT has_table_privilege('authenticated', 'public.user_feed_inbox', 'SELECT') THEN
    RAISE EXCEPTION 'self-check: authenticated lost SELECT on user_feed_inbox';
  END IF;
  FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
    IF has_table_privilege('authenticated', 'public.user_feed_inbox', p) THEN
      RAISE EXCEPTION 'self-check: authenticated has % on user_feed_inbox', p;
    END IF;
  END LOOP;
  FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'REFERENCES'] LOOP
    IF has_any_column_privilege('authenticated', 'public.user_feed_inbox', p) THEN
      RAISE EXCEPTION 'self-check: authenticated has column-level % on user_feed_inbox', p;
    END IF;
  END LOOP;

  -- user_saved_searches: SELECT + DELETE table-wide, nothing else table-wide.
  FOREACH p IN ARRAY ARRAY['SELECT', 'DELETE'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.user_saved_searches', p) THEN
      RAISE EXCEPTION 'self-check: authenticated lost % on user_saved_searches', p;
    END IF;
  END LOOP;
  FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] LOOP
    IF has_table_privilege('authenticated', 'public.user_saved_searches', p) THEN
      RAISE EXCEPTION 'self-check: authenticated has table-wide % on user_saved_searches', p;
    END IF;
  END LOOP;
  -- Column level: INSERT/UPDATE exactly on the editable columns that exist; never on server-only ones.
  FOR c IN
    SELECT att.attname::text AS col FROM pg_attribute att
     WHERE att.attrelid = 'public.user_saved_searches'::regclass AND att.attnum > 0 AND NOT att.attisdropped
  LOOP
    want := c.col = ANY (editable);
    IF c.col = ANY (server_only) AND want THEN
      RAISE EXCEPTION 'self-check: % is both editable and server-only', c.col;
    END IF;
    FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE'] LOOP
      IF has_column_privilege('authenticated', 'public.user_saved_searches', c.col, p) IS DISTINCT FROM want THEN
        RAISE EXCEPTION 'self-check: authenticated % on user_saved_searches.% is %, expected %',
          p, c.col, NOT want, want;
      END IF;
    END LOOP;
  END LOOP;
  FOREACH t IN ARRAY server_only LOOP
    IF has_column_privilege('authenticated', 'public.user_saved_searches', t, 'INSERT')
       OR has_column_privilege('authenticated', 'public.user_saved_searches', t, 'UPDATE') THEN
      RAISE EXCEPTION 'self-check: server-only column % is client-writable', t;
    END IF;
  END LOOP;

  -- Constraints present and validated.
  FOREACH t IN ARRAY cons LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.user_saved_searches'::regclass
                      AND conname = t AND contype = 'c' AND convalidated) THEN
      RAISE EXCEPTION 'self-check: constraint % missing or not validated', t;
    END IF;
  END LOOP;

  -- Guard trigger present, enabled, BEFORE INSERT OR UPDATE, row-level, on the expected function.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger tg
     WHERE tg.tgrelid = 'public.user_saved_searches'::regclass
       AND tg.tgname = 'user_saved_searches_guard' AND NOT tg.tgisinternal
       AND tg.tgenabled IN ('O', 'A')
       AND tg.tgfoid = 'public.user_saved_searches_guard()'::regprocedure
       AND (tg.tgtype & 1) = 1      -- ROW
       AND (tg.tgtype & 2) = 2      -- BEFORE
       AND (tg.tgtype & 4) = 4      -- INSERT
       AND (tg.tgtype & 16) = 16    -- UPDATE
  ) THEN
    RAISE EXCEPTION 'self-check: user_saved_searches_guard trigger missing or wrong shape';
  END IF;
  IF has_function_privilege('authenticated', 'public.user_saved_searches_guard()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.user_saved_searches_guard()', 'EXECUTE') THEN
    RAISE EXCEPTION 'self-check: guard function is client-executable';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
