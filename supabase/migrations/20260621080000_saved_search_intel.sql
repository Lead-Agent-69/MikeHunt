-- Intelligence Expansion (Phase 1): saved-search profit/GO gating + the flash-deal feed.
-- Reuses the existing user_saved_searches matcher (lib/scrapers/pipeline.ts) and the deals table.

-- 1. Saved Search Alerts: opt-in to only match engine-verdict GO deals.
--    (target_profit / max_price / make / model / year range already exist on this table.)
ALTER TABLE public.user_saved_searches
  ADD COLUMN IF NOT EXISTS require_go BOOLEAN DEFAULT false;

-- 2. Flash Deal Feed: fresh-to-market (<24h), engine verdict GO, and at least 10% below the
--    resale estimate. Computed on read — no notification column or scheduled job needed.
CREATE OR REPLACE VIEW public.flash_deals AS
SELECT
  d.*,
  EXTRACT(EPOCH FROM (d.first_seen_at + INTERVAL '24 hours' - NOW()))            AS seconds_remaining,
  ROUND(((d.sell_estimate - d.ask_price) / NULLIF(d.sell_estimate, 0)) * 100, 1) AS below_market_pct
FROM public.deals d
WHERE d.active = true
  AND d.first_seen_at > NOW() - INTERVAL '24 hours'
  AND d.deal_verdict = 'go'
  AND d.sell_estimate > 0
  AND d.ask_price < d.sell_estimate * 0.90
  AND d.first_seen_at + INTERVAL '24 hours' > NOW()
ORDER BY d.true_net_profit DESC NULLS LAST;

-- The view inherits the deals table's "anyone can view active deals" RLS via security_invoker so
-- anonymous/auth clients can read it the same way they read deals.
ALTER VIEW public.flash_deals SET (security_invoker = true);
