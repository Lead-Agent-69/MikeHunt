-- Ren's #296 review follow-up (P2-3, P3-4). Requires 20261010200000_scraper_reliability.
-- (20261010210000 was proposed but is taken by #306, so this sits at 205000, right after 200000.)
--
-- P3-4: the identity sequences behind scraper_errors / scraper_dead_letters / scraper_alerts.id got
--       Supabase's default sequence grants (anon/authenticated USAGE, SELECT, UPDATE). Nothing client-side
--       needs them; revoke. service_role keeps inserting: GENERATED ALWAYS identity needs no sequence grant.
-- P2-3: self-check. Aborts the whole migration (nothing applied) unless:
--       no client privileges (anon, authenticated, PUBLIC) on the 3 tables or source_health_sla,
--       RLS on all 3 tables with 0 policies, source_health_sla is security_invoker, the identity
--       sequences are not client-usable, and run_retention() is SECURITY DEFINER with a pinned
--       search_path and not executable by anon, authenticated or PUBLIC.

BEGIN;

DO $$
DECLARE
  t text;
  seq text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scraper_errors', 'scraper_dead_letters', 'scraper_alerts'] LOOP
    seq := pg_get_serial_sequence(format('public.%I', t), 'id');
    IF seq IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon, authenticated', seq);
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE
  t text;
  r text;
  seq text;
  problems text[] := ARRAY[]::text[];
  fn oid := to_regprocedure('public.run_retention()');
BEGIN
  FOREACH t IN ARRAY ARRAY['scraper_errors', 'scraper_dead_letters', 'scraper_alerts', 'source_health_sla'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      problems := problems || format('%s missing', t);
      CONTINUE;
    END IF;
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'public'] LOOP
      IF has_table_privilege(r, format('public.%I', t),
           'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') THEN
        problems := problems || format('%s has privileges on %s', r, t);
      END IF;
    END LOOP;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['scraper_errors', 'scraper_dead_letters', 'scraper_alerts'] LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass(format('public.%I', t))) THEN
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

  IF to_regclass('public.source_health_sla') IS NOT NULL AND NOT coalesce(
       (SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class
         WHERE oid = 'public.source_health_sla'::regclass), false) THEN
    problems := problems || 'source_health_sla is not security_invoker'::text;
  END IF;

  IF fn IS NULL THEN
    problems := problems || 'run_retention() missing'::text;
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
    RAISE EXCEPTION 'scraper reliability self-check failed: %', array_to_string(problems, '; ');
  END IF;
  RAISE NOTICE 'scraper reliability self-check passed';
END
$$;

COMMIT;
