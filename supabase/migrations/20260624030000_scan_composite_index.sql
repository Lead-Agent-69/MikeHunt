-- Perf: the scan endpoint filters active=true (+ optional deal_verdict / make / location_state) and
-- orders by profit_score DESC. Add a partial composite index covering that hot path so it stays fast
-- as the deals table grows (was falling back to the go-only index or a scan for other verdicts).

CREATE INDEX IF NOT EXISTS idx_deals_scan
  ON public.deals (deal_verdict, make, location_state, profit_score DESC)
  WHERE active = true;
