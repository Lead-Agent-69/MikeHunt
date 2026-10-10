-- Column-level re-check of public.market_timing_signals and public.stripe_events (Ren review of #279).
-- Check-only: no grants, revokes or schema changes.
--
-- has_table_privilege only sees table-level grants. A column grant such as
-- GRANT SELECT (id) ON public.stripe_events TO anon would pass every earlier check and still be
-- readable over PostgREST, so this checks has_any_column_privilege for every column-grantable
-- privilege (SELECT, INSERT, UPDATE, REFERENCES).
-- It also fails if a client role is a member of a privileged role (GRANT service_role TO anon,
-- or the predefined pg_read_all_data / pg_write_all_data, which bypass table grants), or if a
-- client role has SUPERUSER or BYPASSRLS.
--
-- Order: apply after 20261010140000_market_timing_stripe_events_recheck. Needs Ren SIGN before any
-- hosted apply.

DO $$
DECLARE
  r text;
  p text;
  g text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege(r, 'public.market_timing_signals', p) THEN
        RAISE EXCEPTION 'market_timing_signals has a column % -able by %', p, r;
      END IF;
      IF has_any_column_privilege(r, 'public.stripe_events', p) THEN
        RAISE EXCEPTION 'stripe_events has a column % -able by %', p, r;
      END IF;
    END LOOP;

    FOREACH g IN ARRAY ARRAY['service_role', 'postgres', 'supabase_admin', 'authenticator', 'pg_read_all_data', 'pg_write_all_data'] LOOP
      -- Nested IF: plpgsql does not promise AND short-circuits, and pg_has_role errors on a
      -- role that does not exist.
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g) THEN
        IF pg_has_role(r, g, 'MEMBER') THEN
          RAISE EXCEPTION '% is a member of %', r, g;
        END IF;
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r AND (rolsuper OR rolbypassrls)) THEN
      RAISE EXCEPTION '% has SUPERUSER or BYPASSRLS', r;
    END IF;
  END LOOP;
END
$$;
