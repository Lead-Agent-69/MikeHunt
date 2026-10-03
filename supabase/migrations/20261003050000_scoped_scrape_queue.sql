-- Turn scrape_jobs into a private, buyer-scoped production work queue.
ALTER TABLE public.scrape_jobs
  ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_ids TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS orchestrator TEXT NOT NULL DEFAULT 'concurrent',
  ADD COLUMN IF NOT EXISTS concurrency INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS worker_id TEXT,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result JSONB;

ALTER TABLE public.scrape_jobs ALTER COLUMN started_at DROP DEFAULT;
ALTER TABLE public.scrape_jobs ALTER COLUMN started_at DROP NOT NULL;

CREATE INDEX IF NOT EXISTS scrape_jobs_claim_idx
  ON public.scrape_jobs (status, created_at)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS scrape_jobs_requester_idx
  ON public.scrape_jobs (requested_by, created_at DESC);

-- Raw job errors and scopes are private. The service role bypasses RLS; users can only read their own.
DROP POLICY IF EXISTS "Allow public read access" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Allow service role full access" ON public.scrape_jobs;
DROP POLICY IF EXISTS "Users read own scrape jobs" ON public.scrape_jobs;
CREATE POLICY "Users read own scrape jobs"
  ON public.scrape_jobs FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

-- Atomically claim one pending request so multiple future workers cannot run the same import.
CREATE OR REPLACE FUNCTION public.claim_next_scrape_job(p_worker_id TEXT)
RETURNS SETOF public.scrape_jobs
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.scrape_jobs AS job
  SET status = 'running',
      worker_id = p_worker_id,
      started_at = now(),
      heartbeat_at = now(),
      attempts = attempts + 1,
      error_message = NULL
  WHERE job.id = (
    SELECT candidate.id
    FROM public.scrape_jobs AS candidate
    WHERE candidate.status = 'pending'
    ORDER BY candidate.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  RETURNING job.*;
$$;

REVOKE ALL ON FUNCTION public.claim_next_scrape_job(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_scrape_job(TEXT) TO service_role;
