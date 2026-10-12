-- Server-only lockdown for public.market_timing_signals, plus a re-check of public.stripe_events.
--
-- (a) market_timing_signals: every reader (dashboard/summary, market/ticker, market/compare,
--     market/analyst, market/timing, deal-iq) uses the service-role client, so client roles need
--     no access. The view is security_invoker, so anon/authenticated are already denied through
--     price_history, but they still hold SELECT on the view itself (Supabase default privileges).
--     Remove that so the view is closed even if price_history grants ever change.
-- (b) stripe_events: re-assert the 20261010100000 self-check (no client access, RLS on,
--     service_role can write) so a drift since then fails loudly.
--
-- Correction to the header of 20261010100000_stripe_events.sql (applied; not edited in place):
-- it says the webhook "processes without the dedupe" when the table is missing. That changed in
-- #255: the table is applied on hosted, and /api/billing/webhook now FAILS CLOSED (500 + Sentry,
-- Stripe retries) on any stripe_events claim error other than a duplicate (23505), including a
-- missing table (42P01 / PGRST205).
--
-- Order: apply after 20261010100000_stripe_events and 20261010110000_market_timing_like_for_like.
-- Needs Ren SIGN before any hosted apply.

BEGIN;

-- (a) market_timing_signals
REVOKE ALL ON public.market_timing_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.market_timing_signals TO service_role;

-- (b) stripe_events: keep the table comment in step with the corrected behaviour.
COMMENT ON TABLE public.stripe_events IS
  'Stripe webhook idempotency ledger (event id claimed before processing; webhook fails closed if the claim errors). Server-only.';

-- Self-check: fail the migration if a client role can read/write either object, the server can't,
-- the view lost security_invoker, or stripe_events lost RLS.
DO $$
DECLARE
  r text;
  p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(r, 'public.market_timing_signals', p) THEN
        RAISE EXCEPTION 'market_timing_signals still % -able by %', p, r;
      END IF;
      IF has_table_privilege(r, 'public.stripe_events', p) THEN
        RAISE EXCEPTION 'stripe_events still % -able by %', p, r;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.market_timing_signals', 'SELECT') THEN
    RAISE EXCEPTION 'service_role cannot SELECT market_timing_signals';
  END IF;
  IF NOT coalesce(
    (SELECT 'security_invoker=true' = ANY (reloptions) FROM pg_class
      WHERE oid = 'public.market_timing_signals'::regclass), false) THEN
    RAISE EXCEPTION 'market_timing_signals is not security_invoker';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.stripe_events', 'INSERT') THEN
    RAISE EXCEPTION 'service_role cannot INSERT into stripe_events';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.stripe_events'::regclass) THEN
    RAISE EXCEPTION 'stripe_events RLS is not enabled';
  END IF;
END
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
