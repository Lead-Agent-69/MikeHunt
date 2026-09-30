-- Page-level analytics (P2): answer "which of the 6+ overlapping deal feeds does anyone actually
-- open?" so pruning `/find` vs `/discover` vs `/feed` vs `/list` vs `/swipe` vs `/today` becomes a
-- data decision instead of a guess (STATUS.md: "No per-page usage analytics -> prune after adding
-- one").
--
-- WHY NOT @vercel/analytics: it declares peerOptional @sveltejs/kit, which npm walks into
-- @sveltejs/vite-plugin-svelte -> vite@^8, irreconcilable with this project's vite@5. Adding it
-- left `npm install` unresolvable without --legacy-peer-deps. Owning the table also keeps the
-- counts queryable from SQL for the actual prune analysis.
--
-- WRITE PATH: /api/analytics/pageview runs with the service role, which BYPASSES RLS. There is
-- deliberately NO insert policy for anon/authenticated — otherwise any visitor could forge
-- arbitrary path counts.
--
-- READ PATH: admins only, via user_profiles.role (same model /api/admin/stats uses).
--
-- NO user_id: identifying the visitor would cost an auth roundtrip on every single page view,
-- which is unacceptable for a fire-and-forget beacon. Route-pruning decisions are aggregate
-- counts, and that is all this table is for.

CREATE TABLE IF NOT EXISTS public.page_views (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  path       TEXT NOT NULL,
  referrer   TEXT,
  device     TEXT,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The whole point of the table is this shape of query:
--   SELECT path, count(*) FROM page_views
--   WHERE viewed_at > now() - interval '30 days' GROUP BY path ORDER BY 2 DESC;
CREATE INDEX IF NOT EXISTS page_views_path_viewed_idx
  ON public.page_views (path, viewed_at DESC);

CREATE INDEX IF NOT EXISTS page_views_viewed_idx
  ON public.page_views (viewed_at DESC);

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "page_views_admin_read" ON public.page_views;
CREATE POLICY "page_views_admin_read"
  ON public.page_views
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id = auth.uid()
        AND up.role = 'admin'
    )
  );

COMMENT ON TABLE public.page_views IS
  'Anonymous-ish page telemetry for route-pruning decisions. Service-role writes (bypass RLS); admin-only reads; no anon insert policy on purpose.';
