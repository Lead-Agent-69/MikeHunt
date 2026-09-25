-- Self-monitoring: every source's outcome on every scrape run is recorded here, so the system can
-- see its own health, auto-skip consistently-failing sources, and surface freshness/quality.
CREATE TABLE IF NOT EXISTS public.scrape_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  deals_found  INTEGER DEFAULT 0,
  duration_ms  INTEGER,
  error        TEXT,
  run_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_source_time ON public.scrape_runs(source, run_at DESC);
CREATE INDEX IF NOT EXISTS idx_scrape_runs_time ON public.scrape_runs(run_at DESC);

ALTER TABLE public.scrape_runs ENABLE ROW LEVEL SECURITY;
-- Public read so the status surface can show health; writes happen via the service role in the runner.
DROP POLICY IF EXISTS "scrape_runs_read" ON public.scrape_runs;
CREATE POLICY "scrape_runs_read" ON public.scrape_runs FOR SELECT USING (true);

-- Per-source health summary over the last 7 days (used by self-healing + the status endpoint).
CREATE OR REPLACE VIEW public.source_health AS
SELECT
  source,
  count(*)                                   AS runs_7d,
  count(*) FILTER (WHERE ok)                 AS ok_7d,
  round(avg(deals_found) FILTER (WHERE ok))  AS avg_deals,
  max(run_at)                                AS last_run,
  max(run_at) FILTER (WHERE ok)              AS last_ok,
  (SELECT bool_and(NOT r2.ok) FROM (
      SELECT ok FROM public.scrape_runs s2
      WHERE s2.source = s.source ORDER BY run_at DESC LIMIT 3
   ) r2)                                     AS last3_all_failed
FROM public.scrape_runs s
WHERE run_at > now() - interval '7 days'
GROUP BY source;
