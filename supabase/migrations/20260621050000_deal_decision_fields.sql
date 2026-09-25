-- Decision fields from the comprehensive deal analyzer (lib/scoring/deal-analyzer.ts).
-- Existing columns reused: estimated_repair_cost, estimated_transport_cost, true_net_profit,
-- profit_score (now 0-130), is_arbitrage_opportunity (now = verdict 'go').

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS sell_estimate NUMERIC,
  ADD COLUMN IF NOT EXISTS recommended_max_bid NUMERIC,
  ADD COLUMN IF NOT EXISTS deal_verdict TEXT,
  ADD COLUMN IF NOT EXISTS deal_analysis JSONB;

-- Index to rank/filter strong deals quickly.
CREATE INDEX IF NOT EXISTS deals_verdict_score_idx
  ON public.deals(deal_verdict, profit_score DESC);
