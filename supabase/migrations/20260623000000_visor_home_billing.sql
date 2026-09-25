-- Visor integration: market-pulse + profit-by-trim RPCs, changelog, billing fields.

-- Market pulse: vehicle types with the most live GO deals (home-screen intelligence).
CREATE OR REPLACE FUNCTION public.get_market_pulse()
RETURNS TABLE (make TEXT, model TEXT, go_deals BIGINT, avg_profit NUMERIC, avg_days INT)
LANGUAGE SQL STABLE AS $$
  SELECT
    d.make,
    d.model,
    COUNT(*) FILTER (WHERE d.deal_verdict = 'go')                              AS go_deals,
    ROUND(AVG(d.true_net_profit) FILTER (WHERE d.deal_verdict = 'go'), 0)      AS avg_profit,
    ROUND(AVG(EXTRACT(DAY FROM (NOW() - d.first_seen_at))))::INT               AS avg_days
  FROM public.deals d
  WHERE d.active = true AND d.make IS NOT NULL AND d.model IS NOT NULL
  GROUP BY d.make, d.model
  HAVING COUNT(*) FILTER (WHERE d.deal_verdict = 'go') > 3
  ORDER BY go_deals DESC
  LIMIT 12;
$$;

-- Profit by trim for a make/model (vehicle overview pages).
-- NB: "trim" is a reserved word, so the output column is trim_name.
CREATE OR REPLACE FUNCTION public.get_profit_by_trim(p_make TEXT, p_model TEXT)
RETURNS TABLE (trim_name TEXT, go_deals BIGINT, avg_profit NUMERIC, avg_ask NUMERIC)
LANGUAGE SQL STABLE AS $$
  SELECT
    d.trim AS trim_name,
    COUNT(*) FILTER (WHERE d.deal_verdict = 'go')                          AS go_deals,
    ROUND(AVG(d.true_net_profit) FILTER (WHERE d.deal_verdict = 'go'), 0)  AS avg_profit,
    ROUND(AVG(d.ask_price), 0)                                             AS avg_ask
  FROM public.deals d
  WHERE d.active = true
    AND lower(d.make) = lower(p_make)
    AND lower(d.model) ILIKE '%' || lower(p_model) || '%'
    AND d.trim IS NOT NULL AND d.trim <> ''
  GROUP BY d.trim
  ORDER BY avg_profit DESC NULLS LAST
  LIMIT 12;
$$;

-- Public changelog (trust-building).
CREATE TABLE IF NOT EXISTS public.changelog (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version      TEXT,
  title        TEXT NOT NULL,
  body         TEXT,
  features     TEXT[],
  fixes        TEXT[],
  is_major     BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.changelog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "changelog_public_read" ON public.changelog;
CREATE POLICY "changelog_public_read" ON public.changelog FOR SELECT USING (true);

-- Billing fields on user_profiles (plan already exists from onboarding migration).
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS plan_started_at TIMESTAMPTZ;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
