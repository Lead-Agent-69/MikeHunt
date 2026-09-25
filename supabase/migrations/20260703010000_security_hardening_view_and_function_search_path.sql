-- Security-advisor hardening (applied to prod 2026-07-02).
-- 1) top_deals view → SECURITY INVOKER (clears the security_definer_view ERROR). Unused by the app +
--    `deals` is public-read (active=true), so this is safe. `source_health` is intentionally left
--    DEFINER — a non-service-role status page reads it and INVOKER would break that page.
alter view public.top_deals set (security_invoker = true);

-- 2) Pin search_path on app functions (clears function_search_path_mutable). pg_catalog+public keeps all
--    public-table + extension (postgis/vector) references resolving.
alter function public.dealers_near(user_lat double precision, user_lng double precision, radius_miles integer) set search_path = pg_catalog, public;
alter function public.detect_duplicates_by_vin(vin_filter text[]) set search_path = pg_catalog, public;
alter function public.get_market_pulse() set search_path = pg_catalog, public;
alter function public.get_profit_by_trim(p_make text, p_model text) set search_path = pg_catalog, public;
alter function public.mark_deals_unseen(p_source text, p_seen_ids text[]) set search_path = pg_catalog, public;
alter function public.match_deals(query_embedding vector, match_threshold double precision, match_count integer) set search_path = pg_catalog, public;
alter function public.record_price_drop_alert() set search_path = pg_catalog, public;
alter function public.search_deals(query text) set search_path = pg_catalog, public;
alter function public.similar_deals_by_id(p_deal_id uuid, p_count integer, p_threshold double precision) set search_path = pg_catalog, public;
alter function public.touch_properties_updated_at() set search_path = pg_catalog, public;
alter function public.touch_saved_properties_updated_at() set search_path = pg_catalog, public;
alter function public.track_price_drop() set search_path = pg_catalog, public;
alter function public.track_property_price_change() set search_path = pg_catalog, public;
alter function public.update_dealer_location() set search_path = pg_catalog, public;
alter function public.update_updated_at() set search_path = pg_catalog, public;
