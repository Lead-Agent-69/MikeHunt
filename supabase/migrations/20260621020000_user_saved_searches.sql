-- Create user_saved_searches table
CREATE TABLE IF NOT EXISTS public.user_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  min_year INT,
  max_year INT,
  max_price DECIMAL,
  target_profit DECIMAL,
  max_distance_miles INT,
  notify_email BOOLEAN DEFAULT true,
  notify_sms BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_run_at TIMESTAMPTZ
);

CREATE INDEX idx_saved_searches_user ON public.user_saved_searches(user_id);

-- Create user_feed_inbox table
CREATE TABLE IF NOT EXISTS public.user_feed_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_id UUID REFERENCES public.user_saved_searches(id) ON DELETE SET NULL,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'saved', 'dismissed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, deal_id)
);

CREATE INDEX idx_feed_inbox_user_status ON public.user_feed_inbox(user_id, status);

-- RLS
ALTER TABLE public.user_saved_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_feed_inbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_searches" ON public.user_saved_searches FOR ALL USING (user_id = auth.uid());
CREATE POLICY "own_inbox" ON public.user_feed_inbox FOR ALL USING (user_id = auth.uid());
