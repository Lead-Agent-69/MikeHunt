-- P0: the "Anyone can view active deals" RLS policy limits ROWS, not COLUMNS. With the public anon
-- key (shipped in the client bundle) anyone could GET /rest/v1/deals?select=* and read every
-- column: the raw pgvector embedding, profit / max-bid / verdict / deal_analysis, seller contact in
-- options, exact lat/lng/zip, kbb/mmr/cargurus comps and internal ids.
--
-- Fix: column-level privileges. anon and authenticated may SELECT only public listing facts. The
-- active-rows RLS policy stays. service_role (every server route, the Zeus scraper) is untouched.
-- Flip economics reach a reseller / dealer desk only through API routes that apply
-- resolveCallerFlipDesk / listingsForDesk.
--
-- Effects: select=* by anon / authenticated now fails with 42501 (PostgREST expands *), so the
-- browser must name granted columns or go through an API (lane + auctions -> /api/deals/lane).
--
-- Realtime: public.deals is in the supabase_realtime publication and app/(dashboard)/scan
-- subscribes to INSERT/UPDATE. POST-APPLY we verify the anon realtime payload carries only granted
-- columns; if it still leaks, drop deals from the publication:
--   ALTER PUBLICATION supabase_realtime DROP TABLE public.deals;
--
-- Keep the grant list identical to lib/deals/deals-public-columns.ts
-- (checked by lib/deals/deals-column-privileges.test.ts). No data change.

BEGIN;

-- 1) Columns
REVOKE SELECT ON public.deals FROM anon, authenticated;
GRANT SELECT (
  id,
  source,
  source_url,
  title,
  year,
  make,
  model,
  trim,
  vin,
  mileage,
  condition,
  damage_type,
  body_class,
  body_style,
  drivetrain,
  engine,
  fuel_type,
  transmission,
  color,
  assembly_country,
  assembly_plant,
  recalls_count,
  keys_present,
  run_drive,
  ask_price,
  buy_now_price,
  price_drop_amount,
  price_drop_days,
  last_price_change_at,
  images,
  location_city,
  location_state,
  active,
  availability_status,
  auction_end_at,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
) ON public.deals TO anon, authenticated;

-- 2) discover_deals returns full scored rows; server-only (app/api/discover uses service role).
REVOKE EXECUTE ON FUNCTION public.discover_deals(text, numeric, integer, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.discover_deals(text, numeric, integer, text[]) TO service_role;

-- 3) top_deals view exposes profit ranking.
DO $$
BEGIN
  IF to_regclass('public.top_deals') IS NOT NULL THEN
    EXECUTE 'REVOKE SELECT ON public.top_deals FROM anon, authenticated';
  END IF;
END
$$;

-- 4) Guard: fail the migration if any server-only column is still selectable by anon/authenticated.
DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(c.column_name || ':' || r.rolname, ', ') INTO leaked
  FROM information_schema.columns c
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
  WHERE c.table_schema = 'public' AND c.table_name = 'deals'
    AND c.column_name = ANY (ARRAY[
      'embedding','embedded_at','embedding_source_hash','lat','lng','location','location_zip',
      'pricing_breakdown','options','dealer_id','source_deal_id','duplicate_of_id',
      'duplicate_confidence','flash_alert_sent','images_cached','kbb_trade_in','kbb_retail',
      'cargurus_price','mmr_value','estimated_transport_cost','estimated_repair_cost',
      'profit_estimate','profit_score','true_net_profit','recommended_max_bid','deal_verdict',
      'deal_analysis','ai_wholesale_estimate','ai_retail_estimate','ai_rationale',
      'is_arbitrage_opportunity','price_gap_detected','sell_estimate'
    ])
    AND has_column_privilege(r.rolname, 'public.deals', c.column_name, 'SELECT');
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'deals column grants still expose: %', leaked;
  END IF;
END
$$;

COMMIT;

-- Post-apply checks:
--   anon: GET /rest/v1/deals?select=*&limit=1        -> 401 / 42501
--   anon: GET /rest/v1/deals?select=id,make&limit=1  -> 200
--   anon: POST /rest/v1/rpc/discover_deals            -> 401 / 42501
--   anon: GET /rest/v1/top_deals?limit=1              -> 401 / 42501
--   anon realtime INSERT/UPDATE payload on deals      -> granted columns only (else drop from publication)
