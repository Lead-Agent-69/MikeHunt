-- Ren's #309 review follow-up (P2-3, P7). CHECK-ONLY: changes nothing, aborts if anything is off.
-- Requires 20261010200000_scraper_reliability and 20261010205000_scraper_reliability_hardening.
--
-- Rechecks everything 205000 checked, plus:
--   P2-3  column-level grants: has_table_privilege misses a GRANT SELECT (col) / UPDATE (col) to a
--         client role, so every table and the view is also checked with has_any_column_privilege.
--   P2-3  PG17 MAINTAIN (VACUUM/ANALYZE/REINDEX/REFRESH/LOCK) must not be held by a client role.
--         Checked only on server_version_num >= 170000 (has_table_privilege rejects it before 17).
--   P7    security_invoker is read with any spelling Postgres accepts (true/on/1/yes, any case), and
--         a missing source_health_sla view is reported as such instead of as "not security_invoker".

DO $$
DECLARE
  t text;
  r text;
  seq text;
  rel regclass;
  opt text;
  problems text[] := ARRAY[]::text[];
  fn oid := to_regprocedure('public.run_retention()');
  pg17 boolean := current_setting('server_version_num')::int >= 170000;
BEGIN
  FOREACH t IN ARRAY ARRAY['scraper_errors', 'scraper_dead_letters', 'scraper_alerts', 'source_health_sla'] LOOP
    rel := to_regclass(format('public.%I', t));
    IF rel IS NULL THEN
      problems := problems || format('public.%s does not exist (apply 20261010200000 first)', t);
      CONTINUE;
    END IF;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
      IF has_table_privilege(r, rel, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
        problems := problems || format('%s has table privileges on %s', r, t);
      END IF;
      IF has_any_column_privilege(r, rel, 'SELECT, INSERT, UPDATE, REFERENCES') THEN
        problems := problems || format('%s has column privileges on %s', r, t);
      END IF;
      IF pg17 AND has_table_privilege(r, rel, 'MAINTAIN') THEN
        problems := problems || format('%s has MAINTAIN on %s', r, t);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['scraper_errors', 'scraper_dead_letters', 'scraper_alerts'] LOOP
    rel := to_regclass(format('public.%I', t));
    IF rel IS NULL THEN CONTINUE; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = rel) THEN
      problems := problems || format('RLS off on %s', t);
    END IF;
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) > 0 THEN
      problems := problems || format('%s has policies (expected 0)', t);
    END IF;
    seq := pg_get_serial_sequence(format('public.%I', t), 'id');
    IF seq IS NOT NULL THEN
      FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
        IF has_sequence_privilege(r, seq, 'USAGE, SELECT, UPDATE') THEN
          problems := problems || format('%s can use sequence %s', r, seq);
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  rel := to_regclass('public.source_health_sla');
  IF rel IS NOT NULL THEN
    IF (SELECT relkind FROM pg_class WHERE oid = rel) <> 'v' THEN
      problems := problems || 'public.source_health_sla is not a view'::text;
    ELSE
      SELECT lower(split_part(o, '=', 2)) INTO opt
        FROM pg_class c, unnest(coalesce(c.reloptions, ARRAY[]::text[])) o
       WHERE c.oid = rel AND lower(split_part(o, '=', 1)) = 'security_invoker';
      IF opt IS NULL OR opt NOT IN ('true', 'on', '1', 'yes', 't', 'y') THEN
        problems := problems || format('source_health_sla is not security_invoker (reloption: %s)',
                                       coalesce(opt, 'unset'));
      END IF;
    END IF;
  END IF;

  IF fn IS NULL THEN
    problems := problems || 'public.run_retention() does not exist'::text;
  ELSE
    IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = fn) THEN
      problems := problems || 'run_retention() is not SECURITY DEFINER'::text;
    END IF;
    IF NOT coalesce((SELECT proconfig @> ARRAY['search_path=public'] FROM pg_proc WHERE oid = fn), false) THEN
      problems := problems || 'run_retention() has no pinned search_path'::text;
    END IF;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
      IF has_function_privilege(r, fn, 'EXECUTE') THEN
        problems := problems || format('%s can execute run_retention()', r);
      END IF;
    END LOOP;
  END IF;

  IF array_length(problems, 1) > 0 THEN
    RAISE EXCEPTION 'scraper reliability self-check (206000) failed: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'scraper reliability self-check (206000) passed (pg17 MAINTAIN checked: %)', pg17;
END
$$;
