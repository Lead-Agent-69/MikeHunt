-- Recursive re-check of everything that can read public.sold_listings (Ren P2 on #282).
-- Check-only: no grants, revokes or schema changes.
--
-- 20261010146000 walks pg_depend one level: views built directly on sold_listings. A view on top of
-- one of those views is missed. With view v1 over sold_listings revoked from anon, and view v2 over
-- v1 granted to anon, v2 runs as its owner and returns sold_listings rows (vin included) to anon.
-- This walks the whole dependency closure instead:
--   * every view or materialized view that depends on sold_listings, directly or through other
--     views (pg_depend -> pg_rewrite, recursive), must not be SELECT-able by anon or authenticated
--   * every SECURITY DEFINER function that reads sold_listings or any view in that closure (source
--     match, or a pg_depend row for SQL BEGIN ATOMIC bodies) must not be executable by them
--
-- Order: apply after 20261010146000_sold_listings_server_only. Needs Ren SIGN before any hosted apply.

DO $$
DECLARE
  r text;
  obj oid;
BEGIN
  FOR obj IN
    WITH RECURSIVE closure(oid) AS (
      SELECT 'public.sold_listings'::regclass::oid
      UNION
      SELECT rw.ev_class
      FROM closure c
      JOIN pg_depend d ON d.refobjid = c.oid AND d.refclassid = 'pg_class'::regclass
      JOIN pg_rewrite rw ON rw.oid = d.objid
      WHERE d.classid = 'pg_rewrite'::regclass
        AND rw.ev_class <> c.oid
    )
    SELECT oid FROM closure WHERE oid <> 'public.sold_listings'::regclass
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(r, obj, 'SELECT') THEN
        RAISE EXCEPTION 'view % reads sold_listings (directly or through views) and is SELECT-able by %',
          obj::regclass, r;
      END IF;
    END LOOP;
  END LOOP;

  FOR obj IN
    WITH RECURSIVE closure(oid) AS (
      SELECT 'public.sold_listings'::regclass::oid
      UNION
      SELECT rw.ev_class
      FROM closure c
      JOIN pg_depend d ON d.refobjid = c.oid AND d.refclassid = 'pg_class'::regclass
      JOIN pg_rewrite rw ON rw.oid = d.objid
      WHERE d.classid = 'pg_rewrite'::regclass
        AND rw.ev_class <> c.oid
    )
    SELECT DISTINCT p2.oid
    FROM pg_proc p2
    JOIN pg_namespace ns ON ns.oid = p2.pronamespace
    JOIN closure c ON true
    JOIN pg_class cl ON cl.oid = c.oid
    WHERE p2.prosecdef
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND (
        p2.prosrc ~* ('\m' || cl.relname || '\M')
        OR EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p2.oid
            AND d.refobjid = c.oid
        )
      )
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_function_privilege(r, obj, 'EXECUTE') THEN
        RAISE EXCEPTION 'SECURITY DEFINER function % reads sold_listings (directly or through views) and is executable by %',
          obj::regprocedure, r;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
