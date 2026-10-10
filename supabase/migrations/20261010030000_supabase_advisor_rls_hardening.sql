-- security(db): Supabase advisor + RLS hardening (phase 2 audit, 2026-10-09).
--
-- Source: Management API security/performance advisors on qupzqpezslsbobhugswp after the
-- 20261010020000 deals column grants were applied. Every change below keeps app behaviour:
-- all callers of the touched functions/tables use the service-role server client
-- (createServerComponentClient / SUPABASE_SERVICE_ROLE_KEY), which bypasses RLS and keeps its grants.
--
-- NOT changed (accepted, documented):
--   * extension_in_public (pg_trgm, postgis, vector): moving them breaks operator/type references
--     in existing functions, indexes and app SQL. Accepted.
--   * spatial_ref_sys RLS disabled: owned by supabase_admin (PostGIS); we cannot ALTER it. It is
--     public EPSG reference data. We attempt to revoke client grants below; if not permitted it is a no-op.
--   * st_estimatedextent overloads: PostGIS-owned, left alone.
--   * unused_index (44): not dropped; stats are cumulative since 2026-08-25 but several are
--     needed by features with low traffic (embedding HNSW, geo GiST). See PR body for candidates.
--   * auth_leaked_password_protection: HIBP is Pro-plan only (API returns 402). password_min_length=12
--     is set directly in Auth config instead.

BEGIN;

-- ---------------------------------------------------------------------------------------------
-- 1) SECURITY DEFINER functions callable by anon/authenticated via /rest/v1/rpc.
--    Callers: count_by_state  -> app/api/state-counts (service role), scripts/scrape-local.ts (service role)
--             dealer_inventory -> app/api/dealer-network (service role)
--             find_duplicate_vins -> no app caller (types only)
--             landing_proof   -> app/api/stats/proof (service role). Exposes avg/total profit of "go"
--                                deals, so it must not be anon-callable directly.
--    Trigger / event-trigger functions never need EXECUTE for API roles (triggers still fire).
-- ---------------------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.count_by_state(text, text)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dealer_inventory()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_duplicate_vins(integer)    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.landing_proof()                 FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.count_by_state(text, text)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.dealer_inventory()              TO service_role;
GRANT  EXECUTE ON FUNCTION public.find_duplicate_vins(integer)    TO service_role;
GRANT  EXECUTE ON FUNCTION public.landing_proof()                 TO service_role;

REVOKE EXECUTE ON FUNCTION public.mirror_user_profile_to_profiles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()                 FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2) security_definer_view: public.source_health ran as its owner (postgres) and was SELECTable
--    by anon -> scraper telemetry readable with the public key. Callers: lib/scrapers/health.ts and
--    app/api/system/status (both service role).
-- ---------------------------------------------------------------------------------------------
ALTER VIEW public.source_health SET (security_invoker = true);
REVOKE ALL ON public.source_health FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3) spatial_ref_sys (PostGIS, owner supabase_admin). Best effort; never fail the migration.
-- ---------------------------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'spatial_ref_sys is not owned by this role; leaving default grants (accepted risk)';
END
$$;

-- ---------------------------------------------------------------------------------------------
-- 4) Internal / server-only tables. RLS already blocks rows (no policies), but table grants
--    were the Supabase defaults (ALL to anon/authenticated). Remove them as defence in depth.
--    TRUNCATE is not subject to RLS, so it is revoked from the client roles everywhere.
-- ---------------------------------------------------------------------------------------------
REVOKE ALL ON public.app_secrets       FROM anon, authenticated;
REVOKE ALL ON public.price_history     FROM anon, authenticated;  -- read via /api/deals/[id]/price-history (service role)
REVOKE ALL ON public.scraper_runs      FROM anon, authenticated;
REVOKE ALL ON public.source_url_cache  FROM anon, authenticated;
REVOKE ALL ON public.harvest_states    FROM anon, authenticated;  -- had a USING(true) read policy exposing requested_by user ids; no client reader
REVOKE ALL ON public.top_deals         FROM anon, authenticated;

-- Tables where a signed-in read policy is intentional: keep authenticated SELECT only.
REVOKE ALL ON public.scrape_jobs   FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.scrape_jobs   FROM authenticated;
REVOKE ALL ON public.scraper_state FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.scraper_state FROM authenticated;
REVOKE ALL ON public.page_views    FROM anon;                     -- written by /api/analytics/pageview (service role)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.page_views    FROM authenticated;

-- deals: clients only ever read (column grants from 20261010020000 stay as they are).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.deals FROM anon, authenticated;

-- vin_price_history: INSERT policy WITH CHECK (true) for every role let anyone write rows.
-- The only writer is app/api/save-from-url (service role, bypasses RLS).
DROP POLICY IF EXISTS "vin_history_insert" ON public.vin_price_history;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.vin_price_history FROM anon, authenticated;

-- TRUNCATE bypasses RLS: no client role should hold it on any public table.
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5) auth_rls_initplan (40 policies): wrap auth.uid() in a scalar subquery so it is evaluated once
--    per statement instead of once per row. Generated from pg_policies; names, roles, commands,
--    PERMISSIVE and expressions are otherwise identical.
-- ---------------------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users view own profile" ON public."profiles";
CREATE POLICY "Users view own profile" ON public."profiles"
  AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid()) = id));

DROP POLICY IF EXISTS "Users update own profile" ON public."profiles";
CREATE POLICY "Users update own profile" ON public."profiles"
  AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT auth.uid()) = id));

DROP POLICY IF EXISTS "Users manage own watchlist" ON public."watchlist";
CREATE POLICY "Users manage own watchlist" ON public."watchlist"
  AS PERMISSIVE FOR ALL TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users manage own alerts" ON public."alerts";
CREATE POLICY "Users manage own alerts" ON public."alerts"
  AS PERMISSIVE FOR ALL TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "Users can read own roles" ON public."user_roles";
CREATE POLICY "Users can read own roles" ON public."user_roles"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((user_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "Admins can read scraper state" ON public."scraper_state";
CREATE POLICY "Admins can read scraper state" ON public."scraper_state"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM user_roles
  WHERE ((user_roles.user_id = ( SELECT auth.uid())) AND (user_roles.role = 'admin'::text)))));

DROP POLICY IF EXISTS "Users can read own alerts" ON public."alert_log";
CREATE POLICY "Users can read own alerts" ON public."alert_log"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_inventory" ON public."inventory";
CREATE POLICY "own_inventory" ON public."inventory"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_transports" ON public."transports";
CREATE POLICY "own_transports" ON public."transports"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_recon" ON public."recon_stages";
CREATE POLICY "own_recon" ON public."recon_stages"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_leads" ON public."leads";
CREATE POLICY "own_leads" ON public."leads"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_matches" ON public."alert_matches";
CREATE POLICY "own_matches" ON public."alert_matches"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_profile" ON public."user_profiles";
CREATE POLICY "own_profile" ON public."user_profiles"
  AS PERMISSIVE FOR ALL TO public
  USING ((id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_saved" ON public."saved_cars";
CREATE POLICY "own_saved" ON public."saved_cars"
  AS PERMISSIVE FOR ALL TO public
  USING ((user_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_vin_history" ON public."vin_price_history";
CREATE POLICY "own_vin_history" ON public."vin_price_history"
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM saved_cars sc
  WHERE ((sc.user_id = ( SELECT auth.uid())) AND ((sc.snapshot ->> 'vin'::text) = vin_price_history.vin)))));

DROP POLICY IF EXISTS "own_searches" ON public."user_saved_searches";
CREATE POLICY "own_searches" ON public."user_saved_searches"
  AS PERMISSIVE FOR ALL TO public
  USING ((user_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_inbox" ON public."user_feed_inbox";
CREATE POLICY "own_inbox" ON public."user_feed_inbox"
  AS PERMISSIVE FOR ALL TO public
  USING ((user_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_parts_estimates" ON public."parts_estimates";
CREATE POLICY "own_parts_estimates" ON public."parts_estimates"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_finance_lenders" ON public."finance_lenders";
CREATE POLICY "own_finance_lenders" ON public."finance_lenders"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_transport_routes" ON public."transport_routes";
CREATE POLICY "own_transport_routes" ON public."transport_routes"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_teardowns" ON public."teardowns";
CREATE POLICY "own_teardowns" ON public."teardowns"
  AS PERMISSIVE FOR ALL TO public
  USING ((dealer_id = ( SELECT auth.uid())))
  WITH CHECK ((dealer_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_outcomes" ON public."deal_outcomes";
CREATE POLICY "own_outcomes" ON public."deal_outcomes"
  AS PERMISSIVE FOR ALL TO public
  USING ((user_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "own_keys" ON public."api_keys";
CREATE POLICY "own_keys" ON public."api_keys"
  AS PERMISSIVE FOR ALL TO public
  USING ((user_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "deal_views_own" ON public."deal_views";
CREATE POLICY "deal_views_own" ON public."deal_views"
  AS PERMISSIVE FOR ALL TO public
  USING ((user_id = ( SELECT auth.uid())))
  WITH CHECK ((user_id = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "dealer_profiles_policy" ON public."dealer_profiles";
CREATE POLICY "dealer_profiles_policy" ON public."dealer_profiles"
  AS PERMISSIVE FOR ALL TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "dealer_deals_policy" ON public."dealer_deals";
CREATE POLICY "dealer_deals_policy" ON public."dealer_deals"
  AS PERMISSIVE FOR ALL TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "dealer_calibration_policy" ON public."dealer_calibration";
CREATE POLICY "dealer_calibration_policy" ON public."dealer_calibration"
  AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_prefs_select" ON public."user_preferences";
CREATE POLICY "own_prefs_select" ON public."user_preferences"
  AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_prefs_insert" ON public."user_preferences";
CREATE POLICY "own_prefs_insert" ON public."user_preferences"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_prefs_update" ON public."user_preferences";
CREATE POLICY "own_prefs_update" ON public."user_preferences"
  AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT auth.uid()) = user_id))
  WITH CHECK ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_run_lists_select" ON public."auction_run_lists";
CREATE POLICY "own_run_lists_select" ON public."auction_run_lists"
  AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_run_lists_insert" ON public."auction_run_lists";
CREATE POLICY "own_run_lists_insert" ON public."auction_run_lists"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_run_lists_update" ON public."auction_run_lists";
CREATE POLICY "own_run_lists_update" ON public."auction_run_lists"
  AS PERMISSIVE FOR UPDATE TO public
  USING ((( SELECT auth.uid()) = user_id))
  WITH CHECK ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_run_lists_delete" ON public."auction_run_lists";
CREATE POLICY "own_run_lists_delete" ON public."auction_run_lists"
  AS PERMISSIVE FOR DELETE TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_push_select" ON public."push_subscriptions";
CREATE POLICY "own_push_select" ON public."push_subscriptions"
  AS PERMISSIVE FOR SELECT TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_push_insert" ON public."push_subscriptions";
CREATE POLICY "own_push_insert" ON public."push_subscriptions"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "own_push_delete" ON public."push_subscriptions";
CREATE POLICY "own_push_delete" ON public."push_subscriptions"
  AS PERMISSIVE FOR DELETE TO public
  USING ((( SELECT auth.uid()) = user_id));

DROP POLICY IF EXISTS "page_views_admin_read" ON public."page_views";
CREATE POLICY "page_views_admin_read" ON public."page_views"
  AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM user_profiles up
  WHERE ((up.id = ( SELECT auth.uid())) AND (up.role = 'admin'::text)))));

DROP POLICY IF EXISTS "Users read own scrape jobs" ON public."scrape_jobs";
CREATE POLICY "Users read own scrape jobs" ON public."scrape_jobs"
  AS PERMISSIVE FOR SELECT TO "authenticated"
  USING ((requested_by = ( SELECT auth.uid())));

DROP POLICY IF EXISTS "deal_signals_read_own" ON public."deal_signals";
CREATE POLICY "deal_signals_read_own" ON public."deal_signals"
  AS PERMISSIVE FOR SELECT TO public
  USING ((user_id = ( SELECT auth.uid())));

-- ---------------------------------------------------------------------------------------------
-- 6) Indexes
-- ---------------------------------------------------------------------------------------------
-- unindexed_foreign_keys
CREATE INDEX IF NOT EXISTS idx_harvest_states_requested_by ON public.harvest_states (requested_by);
-- Hot path: For You pool (order by first_seen_at desc) and geographic arbitrage (first_seen_at >= ...)
CREATE INDEX IF NOT EXISTS idx_deals_active_first_seen ON public.deals (first_seen_at DESC) WHERE active = true;

COMMIT;

NOTIFY pgrst, 'reload schema';
