-- Idempotent security hardening — replacement for the two .bak migrations
-- (20260703010000 / 20260703020000) which were disabled because their hardcoded
-- function lists errored on databases missing any one of those functions.
-- Everything here is data-driven and safe to run repeatedly, on both prod
-- (where the advisor fixes were applied directly on 2026-07-02) and fresh local DBs.

-- 1) top_deals view -> SECURITY INVOKER (clears security_definer_view advisor).
--    source_health is intentionally left DEFINER: a non-service-role status page
--    reads it and INVOKER would break it (see original note).
DO $$
BEGIN
  IF to_regclass('public.top_deals') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.top_deals SET (security_invoker = true)';
  END IF;
END $$;

-- 2) Pin search_path on every public-schema function that doesn't already pin it
--    (clears function_search_path_mutable advisor). Skips extension-owned
--    functions. pg_catalog+public keeps postgis/vector references resolving.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid,
           format('ALTER FUNCTION %s SET search_path = pg_catalog, public',
                  quote_ident(n.nspname) || '.' || quote_ident(p.proname) ||
                  '(' || pg_get_function_identity_arguments(p.oid) || ')') AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
      AND NOT (COALESCE(array_to_string(p.proconfig, ','), '') LIKE '%search_path%')
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;

-- 3) Close anon/authenticated execute on service-role-only DEFINER functions
--    (same targets as the original revoke migration, now existence-guarded).
DO $$
BEGIN
  IF to_regprocedure('public.mark_deals_unseen(text, text[])') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.mark_deals_unseen(text, text[]) FROM anon, authenticated';
  END IF;
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated';
  END IF;
END $$;
