-- Recursive closure check for public.vin_decodes (Ren SIGN-with-nits on #315). Check-only.
--
-- Port of #299/#310's sold_listings closure re-check (20261010148000 + 20261010149000 v2) to
-- vin_decodes, which #315 (20261010420000) made server-only. Fails if a client role (anon,
-- authenticated) can reach vin_decodes rows by any route the catalog shows:
--   * the table itself: row level security off, ANY policy (it must have none), any table privilege,
--     any column privilege, or MAINTAIN (PG17+);
--   * views and materialized views that read vin_decodes directly OR through other views (recursive
--     pg_depend -> pg_rewrite walk, relkind 'v'/'m' only, so a RULE on a client table that mentions
--     vin_decodes does not pull that table in): SELECT, column SELECT, or MAINTAIN;
--   * SECURITY DEFINER functions that read vin_decodes or any closure view, matched by pg_depend
--     (BEGIN ATOMIC bodies) or by body text on schema plus name. An unqualified name matches only when
--     it can resolve to the object: the object's schema is on the function's own search_path
--     (proconfig), or the function sets none (it runs with the caller's). Quoted identifiers match;
--     relname/nspname are regex-escaped before use.
--
-- Known misses (not detectable from the catalog without running the code):
--   * Dynamic SQL: a definer function that builds the table or view name at run time and runs it
--     with EXECUTE (format('SELECT ... FROM %I', ...)) has no literal name to match.
--   * Definer calling invoker: a SECURITY DEFINER function that calls a SECURITY INVOKER function
--     which reads vin_decodes runs the inner one with the definer's rights. Only the outer body is
--     matched here.
--
-- Planted must-fail / must-pass cases: supabase/tests/vin_decodes_closure (run on PG17 by
-- scripts/check-vin-decodes-closure.sh). Order: apply after 20261010420000. Needs Ren SIGN.

DO $$
DECLARE
  r text;
  p text;
  obj oid;
  pg17 boolean := current_setting('server_version_num')::int >= 170000;
BEGIN
  -- N1 (Ren): RLS stays ON with ZERO policies, so even a role that somehow gets a grant reads nothing.
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.vin_decodes'::regclass) THEN
    RAISE EXCEPTION 'vin_decodes has row level security disabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.vin_decodes'::regclass) THEN
    RAISE EXCEPTION 'vin_decodes has % policy(ies); it must have none (server-only)',
      (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.vin_decodes'::regclass);
  END IF;

  -- The table itself: no table or column privilege for a client role, MAINTAIN included (PG17+).
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege(r, 'public.vin_decodes', p) THEN
        RAISE EXCEPTION 'vin_decodes is % -able by %', p, r;
      END IF;
    END LOOP;
    IF pg17 AND has_table_privilege(r, 'public.vin_decodes', 'MAINTAIN') THEN
      RAISE EXCEPTION 'vin_decodes is MAINTAIN-able by %', r;
    END IF;
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_any_column_privilege(r, 'public.vin_decodes', p) THEN
        RAISE EXCEPTION 'vin_decodes has a column % -able by %', p, r;
      END IF;
    END LOOP;
  END LOOP;

  FOR obj IN
    WITH RECURSIVE closure(oid) AS (
      SELECT 'public.vin_decodes'::regclass::oid
      UNION
      SELECT v.oid
      FROM closure c
      JOIN pg_depend d ON d.refobjid = c.oid AND d.refclassid = 'pg_class'::regclass
      JOIN pg_rewrite rw ON rw.oid = d.objid
      JOIN pg_class v ON v.oid = rw.ev_class AND v.relkind IN ('v', 'm')
      WHERE d.classid = 'pg_rewrite'::regclass
        AND v.oid <> c.oid
    )
    SELECT oid FROM closure WHERE oid <> 'public.vin_decodes'::regclass
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(r, obj, 'SELECT') OR has_any_column_privilege(r, obj, 'SELECT') THEN
        RAISE EXCEPTION 'view % reads vin_decodes (directly or through views) and is SELECT-able (table or column privilege) by %',
          obj::regclass, r;
      END IF;
      -- MAINTAIN on a materialized view lets a client REFRESH it (PG17+).
      IF pg17 AND has_table_privilege(r, obj, 'MAINTAIN') THEN
        RAISE EXCEPTION 'view % reads vin_decodes and is MAINTAIN-able by %', obj::regclass, r;
      END IF;
    END LOOP;
  END LOOP;

  FOR obj IN
    WITH RECURSIVE closure(oid) AS (
      SELECT 'public.vin_decodes'::regclass::oid
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
        RAISE EXCEPTION 'SECURITY DEFINER function % reads vin_decodes (directly or through views) and is executable by %',
          obj::regprocedure, r;
      END IF;
    END LOOP;
  END LOOP;
END
$$;
