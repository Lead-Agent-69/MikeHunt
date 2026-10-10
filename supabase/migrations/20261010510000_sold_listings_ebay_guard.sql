-- Ren's nits on #320 (20261010500000). Adds one CHECK and otherwise only verifies.
--
-- Ordering hazard (keep in mind): 20261010410000 re-adds sold_listings_sale_channel_check WITHOUT 'ebay'.
-- Re-running 410000 after 500000 would drop 'ebay' from the allowed channels (and fail outright once an
-- eBay row exists). Never re-run 410000 by hand after 500000; if it ever happens, re-run 500000.
--
-- Requires: 20261010146000 (sold_listings server-only), 20261010410000, 20261010500000 recorded.
BEGIN;

DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE EXCEPTION 'supabase_migrations.schema_migrations is missing; refusing to guess what is applied';
  END IF;
END
$$;

DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(v, ', ') INTO missing
  FROM unnest(ARRAY['20261010146000', '20261010410000', '20261010500000']) AS v
  WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m WHERE m.version = v);
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'apply % before 20261010510000', missing;
  END IF;
END
$$;

-- The 'ebay' channel belongs to eBay rows only.
ALTER TABLE public.sold_listings
  DROP CONSTRAINT IF EXISTS sold_listings_ebay_channel_source,
  ADD CONSTRAINT sold_listings_ebay_channel_source
    CHECK (sale_channel IS DISTINCT FROM 'ebay' OR source IN ('ebay_motors', 'ebay_sold'));

COMMENT ON CONSTRAINT sold_listings_sale_channel_check ON public.sold_listings IS
  'Includes ebay since 20261010500000. Re-running 20261010410000 after that would drop ebay; re-run 500000 if so.';

DO $$
DECLARE
  def text;
  n int;
  bad text;
BEGIN
  -- RLS on, no policies (146000 dropped sold_public_read).
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.sold_listings'::regclass) THEN
    RAISE EXCEPTION 'sold_listings: RLS is off';
  END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'sold_listings';
  IF n <> 0 THEN
    RAISE EXCEPTION 'sold_listings has % policies (expected 0)', n;
  END IF;

  -- No table or column privileges for client roles (MAINTAIN included on PG17).
  SELECT string_agg(r || ':' || p, ', ') INTO bad
  FROM unnest(ARRAY['anon', 'authenticated']) AS r,
       unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
              || CASE WHEN current_setting('server_version_num')::int >= 170000
                      THEN ARRAY['MAINTAIN'] ELSE ARRAY[]::text[] END) AS p
  WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
    AND has_table_privilege(r, 'public.sold_listings', p);
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'sold_listings table privileges for client roles: %', bad;
  END IF;

  SELECT string_agg(DISTINCT grantee || ':' || column_name || ':' || privilege_type, ', ') INTO bad
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'sold_listings'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'sold_listings column privileges for client roles: %', bad;
  END IF;

  SELECT string_agg(DISTINCT c.attname || ':' || r, ', ') INTO bad
  FROM pg_attribute c, unnest(ARRAY['anon', 'authenticated']) AS r
  WHERE c.attrelid = 'public.sold_listings'::regclass AND c.attnum > 0 AND NOT c.attisdropped
    AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)
    AND has_column_privilege(r, 'public.sold_listings', c.attname, 'SELECT,INSERT,UPDATE,REFERENCES');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'sold_listings column access for client roles: %', bad;
  END IF;

  -- Client roles don't inherit a privileged role (service_role, owner, BYPASSRLS, superuser).
  SELECT string_agg(m.rolname || ' in ' || g.rolname, ', ') INTO bad
  FROM pg_roles m
  JOIN pg_roles g ON pg_has_role(m.oid, g.oid, 'MEMBER') AND g.oid <> m.oid
  WHERE m.rolname IN ('anon', 'authenticated')
    AND (g.rolname = 'service_role' OR g.rolbypassrls OR g.rolsuper
         OR g.oid = (SELECT relowner FROM pg_class WHERE oid = 'public.sold_listings'::regclass));
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'client role memberships: %', bad;
  END IF;

  -- #316's attribution CHECK, verified by definition (not just by name).
  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
  WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_gov_attribution';
  IF def IS NULL OR regexp_replace(def, '[\s()]', '', 'g') <> 'CHECKsale_channelISNULLORattributionISNOTNULL' THEN
    RAISE EXCEPTION 'sold_listings_gov_attribution missing or changed: %', def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
  WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_sale_channel_check';
  IF def IS NULL OR def NOT LIKE '%''ebay''%' OR def NOT LIKE '%gov_surplus_auction%' THEN
    RAISE EXCEPTION 'sold_listings_sale_channel_check missing ebay or gov channels: %', def;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO def FROM pg_constraint
  WHERE conrelid = 'public.sold_listings'::regclass AND conname = 'sold_listings_ebay_channel_source';
  IF def IS NULL THEN
    RAISE EXCEPTION 'sold_listings_ebay_channel_source missing';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
