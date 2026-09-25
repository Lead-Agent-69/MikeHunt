-- Add p_states text[] to discover_deals so cars discovery can scope to the user's CHOSEN states (multi-state
-- curation), keeping p_state for single-state/back-compat. Applied to prod via MCP on 2026-07-07; committed
-- here for a fresh rebuild.
DROP FUNCTION IF EXISTS public.discover_deals(text, numeric, integer);

CREATE OR REPLACE FUNCTION public.discover_deals(
  p_state text DEFAULT NULL,
  p_max_price numeric DEFAULT 0,
  p_limit integer DEFAULT 24000,
  p_states text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  FROM (
    SELECT id, source, source_url, title, year, make, model, trim, vin, mileage, condition, damage_type,
           ask_price, sell_estimate, mmr_value, deal_analysis, profit_score, true_net_profit,
           recommended_max_bid, deal_verdict, location_city, location_state, images, last_seen_at,
           first_seen_at, auction_end_at, options
    FROM public.deals
    WHERE active AND ask_price > 0
      AND (p_state IS NULL OR location_state = p_state)
      AND (p_states IS NULL OR location_state = ANY(p_states))
      AND (p_max_price = 0 OR ask_price <= p_max_price)
    ORDER BY last_seen_at DESC, id ASC
    LIMIT p_limit
  ) t;
$function$;