-- Harden self-healing against SILENT breaks: a source can return ok=true but 0 deals when a site
-- changes its markup. Count zero-yield "successful" runs as failures in the health rollup so the
-- self-heal skip (last 3 all failed) catches degradation, not just hard errors.
CREATE OR REPLACE VIEW public.source_health AS
SELECT
  source,
  count(*)                                          AS runs_7d,
  count(*) FILTER (WHERE ok AND deals_found > 0)    AS ok_7d,
  round(avg(deals_found) FILTER (WHERE ok))         AS avg_deals,
  max(run_at)                                       AS last_run,
  max(run_at) FILTER (WHERE ok AND deals_found > 0) AS last_ok,
  (SELECT bool_and(NOT (r2.ok AND r2.deals_found > 0)) FROM (
      SELECT ok, deals_found FROM public.scrape_runs s2
      WHERE s2.source = s.source ORDER BY run_at DESC LIMIT 3
   ) r2)                                            AS last3_all_failed
FROM public.scrape_runs s
WHERE run_at > now() - interval '7 days'
GROUP BY source;
