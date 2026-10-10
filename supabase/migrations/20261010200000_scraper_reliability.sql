-- Scraper reliability & operations (gap audit section II). Service-role only: no anon/authenticated
-- grants on anything here. Free tier: every new table is capped per run in app code and pruned by
-- run_retention() (daily Vercel cron).
--
-- 1. scraper_runs gains the honest per-run summary written by the orchestrator BEFORE the processor:
--    outcome (ok/unchanged/empty/blocked/challenged/failed), error_counts by class (http_403, http_429,
--    http_4xx, http_5xx, timeout, dns, network, robots, challenge, breaker, parse, parse_empty,
--    validation, db_reject), requests, not_modified, scan_mode (incremental/full), and the code
--    version that ran it (git_sha, image_built_at).
-- 2. scraper_errors: a capped sample (<= 25 per run) of the individual failures, 14 days / 5,000 rows.
-- 3. scraper_dead_letters: records that failed parse or validation (raw snippet and payload each
--    <= 2 KB), reviewable and replayable (scripts/replay-dead-letters.ts), 30 days / 2,000 rows.
-- 4. scraper_alerts: circuit-breaker alerts (a source paused after N consecutive failures). Pausing is
--    temporary and never touches the registry or scraper_state.enabled. 90 days.
-- 5. source_health_sla: one row per source for /status (read only by the service-role server route).
-- Writers fall back to the old columns when this migration is not applied yet, so order is free.

BEGIN;

ALTER TABLE public.scraper_runs
  ADD COLUMN IF NOT EXISTS outcome text
    CHECK (outcome IN ('ok', 'unchanged', 'empty', 'blocked', 'challenged', 'failed')),
  ADD COLUMN IF NOT EXISTS error_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS requests integer,
  ADD COLUMN IF NOT EXISTS not_modified integer,
  ADD COLUMN IF NOT EXISTS scan_mode text CHECK (scan_mode IN ('incremental', 'full')),
  ADD COLUMN IF NOT EXISTS git_sha text CHECK (git_sha ~ '^[0-9a-f]{7,40}$'),
  ADD COLUMN IF NOT EXISTS image_built_at timestamptz;

CREATE TABLE IF NOT EXISTS public.scraper_errors (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id      uuid REFERENCES public.scraper_runs(id) ON DELETE CASCADE,
  source      text NOT NULL,
  error_class text NOT NULL,
  http_status integer,
  url         text CHECK (char_length(url) <= 500),
  message     text CHECK (octet_length(message) <= 500),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scraper_errors_source_created_idx
  ON public.scraper_errors (source, created_at DESC);
CREATE INDEX IF NOT EXISTS scraper_errors_created_idx ON public.scraper_errors (created_at);

CREATE TABLE IF NOT EXISTS public.scraper_dead_letters (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id        uuid REFERENCES public.scraper_runs(id) ON DELETE SET NULL,
  source        text NOT NULL,
  url           text CHECK (char_length(url) <= 500),
  reason        text NOT NULL CHECK (octet_length(reason) <= 300),
  raw_snippet   text CHECK (octet_length(raw_snippet) <= 2048),
  payload       jsonb CHECK (octet_length(payload::text) <= 2048),
  created_at    timestamptz NOT NULL DEFAULT now(),
  replayed_at   timestamptz,
  replay_result text CHECK (octet_length(replay_result) <= 300)
);
CREATE INDEX IF NOT EXISTS scraper_dead_letters_pending_idx
  ON public.scraper_dead_letters (source, created_at DESC) WHERE replayed_at IS NULL;
CREATE INDEX IF NOT EXISTS scraper_dead_letters_created_idx
  ON public.scraper_dead_letters (created_at);

CREATE TABLE IF NOT EXISTS public.scraper_alerts (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source               text NOT NULL,
  kind                 text NOT NULL CHECK (kind IN ('circuit_open', 'circuit_closed')),
  consecutive_failures integer NOT NULL DEFAULT 0,
  paused_until         timestamptz,
  message              text CHECK (octet_length(message) <= 500),
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scraper_alerts_source_created_idx
  ON public.scraper_alerts (source, created_at DESC);

ALTER TABLE public.scraper_errors       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraper_alerts       ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.scraper_errors       FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scraper_dead_letters FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.scraper_alerts       FROM PUBLIC, anon, authenticated;
-- Exact service_role set (Supabase default privileges would otherwise also give it TRUNCATE etc.).
REVOKE ALL ON public.scraper_errors       FROM service_role;
REVOKE ALL ON public.scraper_dead_letters FROM service_role;
REVOKE ALL ON public.scraper_alerts       FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraper_errors       TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraper_dead_letters TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scraper_alerts       TO service_role;

-- One row per source that ran in the last 7 days. "healthy" = outcome ok/unchanged, or (rows written
-- before this migration) success with rows found, matching source_health's zero-yield rule.
-- Freshness % = active deals of that source re-observed within 72h (lib/deals/freshness.ts
-- STALE_AFTER_HOURS) over all its active deals; frozen = the rest.
CREATE OR REPLACE VIEW public.source_health_sla
WITH (security_invoker = true) AS
WITH runs AS (
  SELECT
    r.source,
    r.started_at,
    r.status::text AS status,
    r.outcome,
    coalesce(r.deals_found, 0) AS deals_found,
    coalesce(r.error_counts, '{}'::jsonb) AS error_counts,
    r.scan_mode,
    r.git_sha,
    r.image_built_at,
    CASE
      WHEN r.outcome IS NOT NULL THEN r.outcome IN ('ok', 'unchanged')
      ELSE r.status::text = 'success' AND coalesce(r.deals_found, 0) > 0
    END AS healthy,
    row_number() OVER (PARTITION BY r.source ORDER BY r.started_at DESC) AS rn
  FROM public.scraper_runs r
  WHERE r.started_at > now() - interval '7 days'
    AND r.status::text <> 'running'
),
agg AS (
  SELECT
    source,
    count(*)                                              AS runs_7d,
    count(*) FILTER (WHERE healthy)                       AS healthy_runs_7d,
    max(started_at)                                       AS last_run_at,
    max(started_at) FILTER (WHERE healthy)                AS last_success_at,
    max(started_at) FILTER (WHERE healthy AND scan_mode = 'full') AS last_full_scan_at,
    coalesce(min(rn) FILTER (WHERE healthy) - 1, count(*)) AS consecutive_failures,
    sum(coalesce((error_counts ->> 'challenge')::int, 0)) AS challenged_7d,
    sum(
      coalesce((error_counts ->> 'http_403')::int, 0) +
      coalesce((error_counts ->> 'http_429')::int, 0) +
      coalesce((error_counts ->> 'robots')::int, 0) +
      coalesce((error_counts ->> 'breaker')::int, 0)
    )                                                     AS blocked_7d,
    count(*) FILTER (WHERE outcome = 'challenged')        AS challenged_runs_7d,
    count(*) FILTER (WHERE outcome = 'blocked')           AS blocked_runs_7d
  FROM runs
  GROUP BY source
),
latest AS (
  SELECT source, status, outcome, deals_found, error_counts, scan_mode, git_sha, image_built_at
  FROM runs WHERE rn = 1
),
fresh AS (
  SELECT
    d.source::text AS source,
    count(*)                                                         AS active_rows,
    count(*) FILTER (WHERE d.last_seen_at > now() - interval '72 hours') AS live_rows
  FROM public.deals d
  WHERE d.active
  GROUP BY d.source::text
)
SELECT
  a.source,
  a.runs_7d,
  a.healthy_runs_7d,
  a.last_run_at,
  a.last_success_at,
  a.last_full_scan_at,
  a.consecutive_failures,
  l.outcome          AS last_outcome,
  l.status           AS last_status,
  l.deals_found      AS last_run_rows,
  l.error_counts     AS last_error_counts,
  l.scan_mode        AS last_scan_mode,
  l.git_sha          AS last_git_sha,
  l.image_built_at   AS last_image_built_at,
  a.challenged_7d,
  a.blocked_7d,
  a.challenged_runs_7d,
  a.blocked_runs_7d,
  f.active_rows,
  f.live_rows,
  CASE WHEN coalesce(f.active_rows, 0) > 0
       THEN round(100.0 * f.live_rows / f.active_rows, 1) END AS freshness_pct
FROM agg a
JOIN latest l USING (source)
LEFT JOIN fresh f USING (source);

REVOKE ALL ON public.source_health_sla FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.source_health_sla TO service_role;

-- run_retention(): unchanged sections from 20261006020000, plus the three new tables.
CREATE OR REPLACE FUNCTION public.run_retention() RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
  m INTEGER;
  result JSONB := '{}'::jsonb;
BEGIN
  IF to_regclass('public.deal_signals') IS NOT NULL THEN
    DELETE FROM public.deal_signals WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM public.deal_signals s
     USING (
       SELECT id FROM (
         SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
           FROM public.deal_signals
       ) ranked WHERE ranked.rn > 2000
     ) extra
     WHERE s.id = extra.id;
    GET DIAGNOSTICS m = ROW_COUNT;
    result := result || jsonb_build_object('deal_signals', n + m);
  END IF;

  IF to_regclass('public.page_views') IS NOT NULL THEN
    DELETE FROM public.page_views WHERE viewed_at < now() - interval '180 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('page_views', n);
  END IF;

  IF to_regclass('public.deal_views') IS NOT NULL THEN
    DELETE FROM public.deal_views WHERE day < CURRENT_DATE - 90;
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('deal_views', n);
  END IF;

  IF to_regclass('public.scrape_jobs') IS NOT NULL THEN
    DELETE FROM public.scrape_jobs
     WHERE status NOT IN ('pending', 'running')
       AND created_at < now() - interval '14 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('scrape_jobs', n);
  END IF;

  IF to_regclass('public.scraper_runs') IS NOT NULL THEN
    DELETE FROM public.scraper_runs
     WHERE status <> 'running'
       AND started_at < now() - interval '60 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('scraper_runs', n);
  END IF;

  IF to_regclass('public.scraper_errors') IS NOT NULL THEN
    DELETE FROM public.scraper_errors WHERE created_at < now() - interval '14 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM public.scraper_errors
     WHERE id < (SELECT id FROM public.scraper_errors ORDER BY id DESC OFFSET 4999 LIMIT 1);
    GET DIAGNOSTICS m = ROW_COUNT;
    result := result || jsonb_build_object('scraper_errors', n + m);
  END IF;

  IF to_regclass('public.scraper_dead_letters') IS NOT NULL THEN
    DELETE FROM public.scraper_dead_letters WHERE created_at < now() - interval '30 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    DELETE FROM public.scraper_dead_letters
     WHERE id < (SELECT id FROM public.scraper_dead_letters ORDER BY id DESC OFFSET 1999 LIMIT 1);
    GET DIAGNOSTICS m = ROW_COUNT;
    result := result || jsonb_build_object('scraper_dead_letters', n + m);
  END IF;

  IF to_regclass('public.scraper_alerts') IS NOT NULL THEN
    DELETE FROM public.scraper_alerts WHERE created_at < now() - interval '90 days';
    GET DIAGNOSTICS n = ROW_COUNT;
    result := result || jsonb_build_object('scraper_alerts', n);
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_retention() TO service_role;

COMMIT;
