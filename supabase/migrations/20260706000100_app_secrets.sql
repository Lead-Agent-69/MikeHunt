-- Server-only config/secrets (e.g. the VAPID private key). Applied to prod via MCP on 2026-07-06; committed
-- here so a fresh rebuild has it. RLS ENABLED with NO policies → anon + authenticated get nothing; only the
-- service role (which bypasses RLS) can access it. Same trust boundary as the service role key itself.
CREATE TABLE IF NOT EXISTS public.app_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_secrets FROM anon, authenticated, public;
