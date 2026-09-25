-- Create scrape_jobs table for BullMQ worker logging
CREATE TABLE IF NOT EXISTS public.scrape_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  listings_found INTEGER DEFAULT 0,
  listings_saved INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Allow service role full access" ON public.scrape_jobs
  FOR ALL USING (true) WITH CHECK (true);

-- Allow public read for dashboard status
CREATE POLICY "Allow public read access" ON public.scrape_jobs
  FOR SELECT USING (true);
