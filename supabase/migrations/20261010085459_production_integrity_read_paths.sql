BEGIN;
CREATE VIEW public.eligible_deals WITH (security_invoker = true) AS
  SELECT d.* FROM public.deals d WHERE NOT d.access_hold AND d.access_expires_at > now()
    AND public.inventory_access_allowed(d.source_url, 'collect')
    AND public.inventory_access_allowed(d.source_url, 'display');
CREATE VIEW public.eligible_sold_listings WITH (security_invoker = true) AS
  SELECT s.* FROM public.sold_listings s WHERE NOT s.access_hold AND s.access_expires_at > now()
    AND public.inventory_access_allowed(s.source_url, 'collect')
    AND public.inventory_access_allowed(s.source_url, 'derive');
CREATE VIEW public.eligible_valuation_deals WITH (security_invoker = true) AS
  SELECT d.* FROM public.eligible_deals d WHERE public.inventory_access_allowed(d.source_url, 'derive');
CREATE VIEW public.eligible_price_history WITH (security_invoker = true) AS
  SELECT h.* FROM public.price_history h JOIN public.eligible_deals d ON d.id = h.deal_id
    WHERE public.inventory_access_allowed(d.source_url, 'derive');
REVOKE ALL ON public.eligible_deals, public.eligible_sold_listings, public.eligible_price_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eligible_deals, public.eligible_sold_listings, public.eligible_price_history TO service_role;
REVOKE ALL ON public.eligible_valuation_deals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eligible_valuation_deals TO service_role;

-- Preserve existing signatures and caller grants while guarding every inventory read in these RPCs.
DO $migration$
DECLARE f record; definition text; guarded text;
BEGIN
  FOR f IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname IN
      ('count_by_state', 'dealer_inventory', 'discover_deals', 'find_duplicate_vins',
       'get_market_pulse', 'get_profit_by_trim', 'landing_proof', 'match_deals',
       'search_deals', 'similar_deals_by_id', 'similar_deals_by_id_filtered')
  LOOP
    definition := pg_get_functiondef(f.oid);
    guarded := regexp_replace(definition, '(FROM|JOIN)([[:space:]]+)(public\.)?deals([[:space:]]|$)', '\1\2public.eligible_deals\4', 'gi');
    IF f.proname IN ('get_market_pulse', 'get_profit_by_trim', 'match_deals', 'similar_deals_by_id', 'similar_deals_by_id_filtered') THEN
      guarded := replace(guarded, 'public.eligible_deals', 'public.eligible_valuation_deals');
    END IF;
    -- The deployed vector RPC qualifies columns with the original, implicit table name.
    -- Preserve that name only for an unaliased relation; existing aliases stay untouched.
    IF f.proname = 'match_deals' THEN
      guarded := regexp_replace(guarded,
        '(FROM[[:space:]]+public\.eligible_valuation_deals)([[:space:]]+)(WHERE|ORDER|GROUP|HAVING|LIMIT|OFFSET|FETCH|UNION|EXCEPT|INTERSECT|$)',
        '\1 AS deals\2\3', 'gi');
    END IF;
    IF guarded <> definition THEN EXECUTE guarded; END IF;
  END LOOP;
END $migration$;

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY price_history_access_guard ON public.price_history AS RESTRICTIVE
  FOR SELECT TO anon, authenticated USING (EXISTS (
    SELECT 1 FROM public.deals d WHERE d.id = deal_id AND NOT d.access_hold
      AND public.inventory_access_allowed(d.source_url, 'derive')
  ));
CREATE TABLE public.scraper_receipts (
  id uuid PRIMARY KEY,
  observed_at timestamptz NOT NULL,
  event jsonb NOT NULL CHECK (octet_length(event::text) <= 32768),
  reconciled_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scraper_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scraper_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.scraper_receipts TO service_role;
CREATE FUNCTION public.run_integrity_retention() RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE receipts bigint; quarantine bigint;
BEGIN
  DELETE FROM public.scraper_receipts WHERE reconciled_at < now() - interval '30 days';
  GET DIAGNOSTICS receipts = ROW_COUNT;
  DELETE FROM public.scrape_quarantine WHERE status = 'dismissed' AND last_seen_at < now() - interval '90 days';
  GET DIAGNOSTICS quarantine = ROW_COUNT;
  RETURN jsonb_build_object('receipts', receipts, 'dismissedQuarantine', quarantine);
END $$;
REVOKE EXECUTE ON FUNCTION public.run_integrity_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_integrity_retention() TO service_role;
GRANT DELETE ON public.scraper_receipts TO service_role;
COMMIT;
