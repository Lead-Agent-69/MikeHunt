-- Stricter re-check of public.market_timing_signals and public.stripe_events (Ren review of #275).
-- Check-only: no grants, revokes or schema changes. Fails the migration if any of these drift.
--
--   * client roles (anon, authenticated) hold no privilege of any kind on either object
--     (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER)
--   * stripe_events has RLS on and zero policies (pg_policies), so PostgREST can never expose it
--   * service_role can SELECT, INSERT and DELETE stripe_events (the webhook claims an event id with
--     INSERT and releases it with DELETE when processing fails)
--   * service_role can SELECT market_timing_signals
--   * market_timing_signals is security_invoker, read from reloptions with any spelling Postgres
--     accepts for a true boolean (true / on / 1 / yes, any case)
--
-- 20261010120000 already checks a subset of this and is applied on hosted; it is not edited in place.
-- Order: apply after 20261010100000_stripe_events, 20261010110000_market_timing_like_for_like and
-- 20261010120000_market_timing_stripe_events_server_only. Needs Ren SIGN before any hosted apply.

DO $$
DECLARE
  r text;
  p text;
  n integer;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(r, 'public.market_timing_signals', p) THEN
        RAISE EXCEPTION 'market_timing_signals still % -able by %', p, r;
      END IF;
      IF has_table_privilege(r, 'public.stripe_events', p) THEN
        RAISE EXCEPTION 'stripe_events still % -able by %', p, r;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.market_timing_signals', 'SELECT') THEN
    RAISE EXCEPTION 'service_role cannot SELECT market_timing_signals';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c, unnest(c.reloptions) AS o(opt)
    WHERE c.oid = 'public.market_timing_signals'::regclass
      AND lower(split_part(o.opt, '=', 1)) = 'security_invoker'
      AND lower(split_part(o.opt, '=', 2)) IN ('true', 'on', '1', 'yes')
  ) THEN
    RAISE EXCEPTION 'market_timing_signals is not security_invoker';
  END IF;

  FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'DELETE'] LOOP
    IF NOT has_table_privilege('service_role', 'public.stripe_events', p) THEN
      RAISE EXCEPTION 'service_role cannot % stripe_events', p;
    END IF;
  END LOOP;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stripe_events'::regclass) THEN
    RAISE EXCEPTION 'stripe_events RLS is not enabled';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'stripe_events';
  IF n <> 0 THEN
    RAISE EXCEPTION 'stripe_events has % policies (expected 0)', n;
  END IF;
END
$$;
