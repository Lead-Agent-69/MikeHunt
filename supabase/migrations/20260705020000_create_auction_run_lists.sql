-- Create auction_run_lists table to cache dealer uploaded VIN run lists.
CREATE TABLE IF NOT EXISTS public.auction_run_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  auction_name TEXT NOT NULL,
  auction_date DATE NOT NULL,
  vins TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  processed_count INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  -- Per-VIN match results (which uploaded VINs we already track as real scored deals + their verdict/profit).
  -- We MATCH against real inventory — we never fabricate a deal from an uploaded VIN.
  results JSONB NOT NULL DEFAULT '[]'::JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.auction_run_lists ENABLE ROW LEVEL SECURITY;

-- Select policy
DO $$ BEGIN
  CREATE POLICY "own_run_lists_select" ON public.auction_run_lists
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Insert policy
DO $$ BEGIN
  CREATE POLICY "own_run_lists_insert" ON public.auction_run_lists
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Update policy
DO $$ BEGIN
  CREATE POLICY "own_run_lists_update" ON public.auction_run_lists
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Delete policy
DO $$ BEGIN
  CREATE POLICY "own_run_lists_delete" ON public.auction_run_lists
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_auction_run_lists_user ON public.auction_run_lists(user_id);
