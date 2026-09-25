-- Scraper credentials and persistent source state

-- Encrypted credential store for auth-required sources
CREATE TABLE IF NOT EXISTS public.scraper_credentials (
    source_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL, -- encrypted JSON blob
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Persisted source state (enabled/disabled, failure counts, last run)
CREATE TABLE IF NOT EXISTS public.scraper_state (
    source_id TEXT PRIMARY KEY,
    enabled BOOLEAN DEFAULT true,
    consecutive_failures INTEGER DEFAULT 0,
    auto_disable_threshold INTEGER DEFAULT 5,
    last_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    success_rate NUMERIC(4,3) DEFAULT 1.0,
    average_duration_ms INTEGER DEFAULT 0,
    estimated_listings_per_run INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraper_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_state ENABLE ROW LEVEL SECURITY;

-- Service-role only policies
CREATE POLICY "Service role can manage scraper credentials"
    ON public.scraper_credentials
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage scraper state"
    ON public.scraper_state
    AS PERMISSIVE
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow admins to read state
CREATE POLICY "Admins can read scraper state"
    ON public.scraper_state
    AS PERMISSIVE
    FOR SELECT
    TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.user_roles
        WHERE user_id = auth.uid() AND role = 'admin'
    ));
