-- Corrected closure re-check for public.sold_listings (Ren nits on #299). Check-only.
--
-- Same rules as 20261010148000 (no client role may SELECT a view that reads sold_listings directly
-- or through other views, or EXECUTE a SECURITY DEFINER function that reads any of them), with two
-- fixes:
--   * The walk follows views and materialized views only (pg_class.relkind 'v' / 'm'). pg_rewrite
--     also holds rules: a CREATE RULE on deals that mentions sold_listings put deals (a table that is
--     meant to be client-readable) into the closure and failed the check.
--   * Function bodies are matched on schema plus name. A bare name match let a reference to
--     other_schema.deals_v count as public.deals_v. A public object also matches unqualified
--     (search_path), and quoted identifiers match.
--
-- Known misses (not detectable from the catalog without running the code):
--   * Dynamic SQL: a definer function that builds the table or view name at run time and runs it
--     with EXECUTE (format('SELECT ... FROM %I', ...)) has no literal name to match.
--   * Definer calling invoker: a SECURITY DEFINER function that calls a SECURITY INVOKER function
--     which reads sold_listings runs the inner one with the definer's rights. Only the outer body is
--     matched here, so the chain is missed unless the outer body names the table or view itself.
--
-- Order: apply after 20261010148000_sold_listings_view_closure_recheck. Needs Ren SIGN before any
-- hosted apply.

DO $$
DECLARE
  r text;
  obj oid;
BEGIN
  FOR obj IN
    WITH RECURSIVE closure(oid) AS (
      SELECT 'public.sold_listings'::regclass::oid
      UNION
      SELECT v.oid
      FROM closure c
      JOIN pg_depend d ON d.refobjid = c.oid AND d.refclassid = 'pg_class'::regclass
      JOIN pg_rewrite rw ON rw.oid = d.objid
      JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind IN ('v', 'm')
      WHERE d.classid = 'pg_rewrite'::regclass
        AND v.oid <> c.oid
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
      SELECT v.oid
      FROM closure c
      JOIN pg_depend d ON d.refobjid = c.oid AND d.refclassid = 'pg_class'::regclass
      JOIN pg_rewrite rw ON rw.oid = d.objid
      JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind IN ('v', 'm')
      WHERE d.classid = 'pg_rewrite'::regclass
        AND v.oid <> c.oid
    ),
    named AS (
      SELECT c.oid, cl.relname, cn.nspname
      FROM closure c
      JOIN pg_class cl ON cl.oid = c.oid
      JOIN pg_namespace cn ON cn.oid = cl.relnamespace
    )
    SELECT DISTINCT p2.oid
    FROM pg_proc p2
    JOIN pg_namespace ns ON ns.oid = p2.pronamespace
    JOIN named n ON true
    WHERE p2.prosecdef
      AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
      AND (
        -- schema-qualified: schema.name, "schema"."name"
        p2.prosrc ~* ('"?\m' || n.nspname || '\M"?\s*\.\s*"?\m' || n.relname || '\M"?')
        -- public objects may also be named bare (search_path), but not as some_other_schema.name
        OR (n.nspname = 'public'
            AND p2.prosrc ~* ('(^|[^.\w"])"?\m' || n.relname || '\M"?'))
        OR EXISTS (
          SELECT 1 FROM pg_depend d
          WHERE d.classid = 'pg_proc'::regclass
            AND d.objid = p2.oid
            AND d.refobjid = n.oid
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
