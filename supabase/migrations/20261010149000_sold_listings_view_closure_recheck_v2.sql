-- Corrected closure re-check for public.sold_listings (Ren nits on #299). Check-only.
--
-- Same rules as 20261010148000 (no client role may SELECT a view that reads sold_listings directly
-- or through other views, or EXECUTE a SECURITY DEFINER function that reads any of them), with two
-- fixes:
--   * The walk follows views and materialized views only (pg_class.relkind 'v' / 'm'). pg_rewrite
--     also holds rules: a CREATE RULE on deals that mentions sold_listings put deals (a table that is
--     meant to be client-readable) into the closure and failed the check.
--   * Function bodies are matched on schema plus name. A bare name match let a reference to
--     other_schema.deals_v count as public.deals_v. An unqualified name matches only when it can
--     resolve to the object: the object's schema is in the function's own search_path
--     (proconfig, e.g. SET search_path = api, public), or the function sets no search_path (it then
--     runs with the caller's, which can be anything). Quoted identifiers match. relname and nspname
--     are regex-escaped before they are used in a pattern.
--   * Column grants: has_table_privilege(r, view, 'SELECT') is false after
--     GRANT SELECT (vin) ON public.v1 TO anon, so the view loop also checks
--     has_any_column_privilege(r, view, 'SELECT').
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
      IF has_table_privilege(r, obj, 'SELECT') OR has_any_column_privilege(r, obj, 'SELECT') THEN
        RAISE EXCEPTION 'view % reads sold_listings (directly or through views) and is SELECT-able (table or column privilege) by %',
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
      -- regex-escaped names (N3): a name containing . $ ( ) etc. must match literally
      SELECT c.oid,
             cn.nspname,
             regexp_replace(cl.relname, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') AS rel_re,
             regexp_replace(cn.nspname, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') AS nsp_re
      FROM closure c
      JOIN pg_class cl ON cl.oid = c.oid
      JOIN pg_namespace cn ON cn.oid = cl.relnamespace
    ),
    definers AS (
      SELECT p2.oid,
             p2.prosrc,
             -- the function's own search_path (SET search_path = ...), lower-cased, unquoted
             (SELECT array_agg(lower(btrim(btrim(sp), '"')))
                FROM unnest(p2.proconfig) cfg,
                     unnest(string_to_array(substr(cfg, length('search_path=') + 1), ',')) sp
               WHERE cfg LIKE 'search_path=%') AS path,
             EXISTS (SELECT 1 FROM unnest(p2.proconfig) cfg WHERE cfg LIKE 'search_path=%') AS sets_path
      FROM pg_proc p2
      JOIN pg_namespace ns ON ns.oid = p2.pronamespace
      WHERE p2.prosecdef
        AND ns.nspname NOT IN ('pg_catalog', 'information_schema')
    )
    SELECT DISTINCT fd.oid
    FROM definers fd
    JOIN named n ON true
    WHERE
      -- schema-qualified: schema.name, "schema"."name"
      fd.prosrc ~* ('"?\m' || n.nsp_re || '\M"?\s*\.\s*"?\m' || n.rel_re || '\M"?')
      -- unqualified: only when it can resolve to this object (N2)
      OR ((NOT fd.sets_path OR lower(n.nspname) = ANY (fd.path))
          AND fd.prosrc ~* ('(^|[^.\w"])"?\m' || n.rel_re || '\M"?'))
      OR EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = fd.oid
          AND d.refobjid = n.oid
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
