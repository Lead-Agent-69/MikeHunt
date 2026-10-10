-- Ren #312 P3: price_history row level security ON, no policies (stacked on 20261010230000).
--
-- price_history has no anon / authenticated grants, so today nothing client-side can read it, but
-- with RLS off a future GRANT would expose every row at once. RLS on with zero policies makes it
-- service_role only (service_role bypasses RLS). On hosted it is already on (checked read-only
-- 2026-10-10); this makes every environment match and pins it with a self-check.
-- No data change, no new column or index. Idempotent.

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.price_history'::regclass) THEN
    RAISE EXCEPTION 'price_history must have row level security enabled';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'price_history'
             AND roles && ARRAY['anon', 'authenticated', 'public']::name[]) THEN
    RAISE EXCEPTION 'price_history must have no policy for anon / authenticated / public';
  END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
       AND (has_table_privilege(r, 'public.price_history', 'SELECT')
            OR has_table_privilege(r, 'public.price_history', 'INSERT')
            OR has_table_privilege(r, 'public.price_history', 'UPDATE')
            OR has_table_privilege(r, 'public.price_history', 'DELETE')) THEN
      RAISE EXCEPTION 'price_history must have no table privilege for %', r;
    END IF;
  END LOOP;
END $$;

COMMIT;
