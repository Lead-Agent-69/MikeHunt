-- Teardowns: per-vehicle parts teardown estimates saved from the parts tool
CREATE TABLE IF NOT EXISTS public.teardowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id UUID NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
  parts JSONB NOT NULL DEFAULT '[]'::jsonb,
  salvage_cost NUMERIC,
  parts_value NUMERIC,
  net_profit NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_teardowns_dealer ON public.teardowns(dealer_id);
CREATE INDEX IF NOT EXISTS idx_teardowns_inventory ON public.teardowns(inventory_id);

ALTER TABLE public.teardowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_teardowns" ON public.teardowns
  FOR ALL USING (dealer_id = auth.uid()) WITH CHECK (dealer_id = auth.uid());

-- Market trends: aggregated make/model market signals (publicly readable)
CREATE TABLE IF NOT EXISTS public.market_trends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  avg_price NUMERIC NOT NULL,
  avg_days_to_sell INT DEFAULT 21,
  demand_score INT DEFAULT 5,
  supply_count INT DEFAULT 0,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_trends_make_model
  ON public.market_trends(make, model, recorded_at DESC);

ALTER TABLE public.market_trends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "market_trends_public_read" ON public.market_trends
  FOR SELECT USING (true);
