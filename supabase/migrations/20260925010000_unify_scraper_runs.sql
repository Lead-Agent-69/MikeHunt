-- Unify the scraper run log: scraper_runs becomes THE run-log for the fleet; scrape_runs is retired.
--
-- Why: a single scrape wrote BOTH tables. The orchestrator (lib/scrapers/orchestrators/base.ts)
-- logged a rich per-source row to scraper_runs (status + deals_new + error_message, updated at
-- completion), while lib/scrapers/health.ts wrote a second, thinner row to scrape_runs — and
-- source_health / the status surface read only that second table. Two writes, two failure modes,
-- two truths. Now base.ts is the only writer (scraper_runs), and source_health reads it back.
--
-- Fix (1): scraper_runs.source was the deal_source ENUM, so any source id outside the enum
-- ('govdeals', 'publicsurplus', 'municibid', …) made the INSERT fail; base.ts falls back to a
-- synthetic 'untracked-…' run id and the run becomes invisible to health. TEXT matches the
-- registry's free-form ids.
ALTER TABLE public.scraper_runs ALTER COLUMN source TYPE text USING source::text;

-- Fix (2): recreate source_health over scraper_runs. Identical output columns (runs_7d, ok_7d,
-- avg_deals, last_run, last_ok, last3_all_failed) so every existing reader is unchanged, and the
-- zero-yield hardening is preserved: a run is OK only when status='success' AND it actually produced
-- deals, so a source that silently returns 0 (markup drift) degrades into failures. In-flight
-- ('running') rows are excluded from the last-3 window so a source mid-run can't read as three
-- consecutive failures; a stuck 'running' row ages out of the 7-day window on its own.
CREATE OR REPLACE VIEW public.source_health AS
SELECT
  source,
  count(*)                                                              AS runs_7d,
  count(*) FILTER (WHERE status = 'success' AND deals_found > 0)        AS ok_7d,
  round(avg(deals_found) FILTER (WHERE status = 'success'))             AS avg_deals,
  max(started_at)                                                       AS last_run,
  max(started_at) FILTER (WHERE status = 'success' AND deals_found > 0) AS last_ok,
  (SELECT bool_and(NOT (r2.status = 'success' AND coalesce(r2.deals_found, 0) > 0)) FROM (
      SELECT status, deals_found FROM public.scraper_runs s2
      WHERE s2.source = s.source AND s2.status <> 'running'
      ORDER BY started_at DESC LIMIT 3
   ) r2)                                                                AS last3_all_failed
FROM public.scraper_runs s
WHERE started_at > now() - interval '7 days'
GROUP BY source;

-- scrape_runs is intentionally NOT dropped: a shared DealerHunt-PRO deployment may still write and
-- read it. This app no longer touches it — no scraper-path writes, no app-code reads.
COMMENT ON TABLE public.scrape_runs IS
  'Retired by MikeHunt (unified into scraper_runs, 2026-09-25). Kept for DealerHunt-PRO compatibility; not written or read by this app.';
