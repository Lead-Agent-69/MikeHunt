-- C: usage metering for plan gating. Tracks which deals a dealer has analyzed each day so the free
-- tier can be capped at FREE_DEAL_VIEWS_PER_DAY distinct deals/day (see lib/auth/plan.ts). Paid plans
-- are never metered. Per-user RLS.

CREATE TABLE IF NOT EXISTS public.deal_views (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id    UUID NOT NULL,
  day        DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, deal_id, day)
);

ALTER TABLE public.deal_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_views_own" ON public.deal_views;
CREATE POLICY "deal_views_own" ON public.deal_views
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_deal_views_user_day ON public.deal_views(user_id, day);
