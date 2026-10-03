-- The original migration called this a service-role policy but omitted TO service_role, which made
-- USING (true) apply to every Postgres role. Service-role clients bypass RLS and need no policy.
DROP POLICY IF EXISTS "Allow service role full access" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Allow public read access" ON public.scrape_jobs;
