-- Moat intelligence: outcome feedback (self-calibrating verdicts) + bulk multi-unit alerts.

-- 1. deal_outcomes — dealers log what ACTUALLY happened vs. what the engine predicted. This is the
--    feedback the verdict engine never had: actual sale price, days-to-sell, real transport/recon.
--    Calibration (lib/scoring/calibration.ts) reads this to personalize estimates per dealer.
CREATE TABLE IF NOT EXISTS public.deal_outcomes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id             UUID REFERENCES public.deals(id) ON DELETE SET NULL,
  inventory_id        UUID REFERENCES public.inventory(id) ON DELETE SET NULL,
  vin                 TEXT,
  year                INT,
  make                TEXT,
  model               TEXT,
  location_state      TEXT,

  -- What the platform predicted (snapshot at purchase).
  predicted_profit    NUMERIC,
  predicted_sell      NUMERIC,
  predicted_transport NUMERIC,
  predicted_recon     NUMERIC,

  -- What actually happened.
  purchase_price      NUMERIC NOT NULL,
  sell_price          NUMERIC,
  actual_transport    NUMERIC,
  actual_recon        NUMERIC,
  actual_fees         NUMERIC,
  actual_profit       NUMERIC,
  days_to_sell        INT,
  sold_where          TEXT,

  purchased_at        TIMESTAMPTZ DEFAULT NOW(),
  sold_at             TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_outcomes_user ON public.deal_outcomes(user_id, created_at DESC);

ALTER TABLE public.deal_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_outcomes" ON public.deal_outcomes;
CREATE POLICY "own_outcomes" ON public.deal_outcomes FOR ALL USING (user_id = auth.uid());

-- 2. Bulk / multi-unit alerts: a saved search can require N matching units before it fires, so a
--    fleet buyer can ask "notify me when 3+ Transit vans under $15k appear."
ALTER TABLE public.user_saved_searches
  ADD COLUMN IF NOT EXISTS min_count INT DEFAULT 1;
