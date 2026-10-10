-- Stripe webhook idempotency ledger (app/api/billing/webhook).
--
-- The webhook inserts the Stripe event id here BEFORE processing and skips the event when the
-- insert hits the primary key (23505), so Stripe's at-least-once redelivery can't apply an event
-- twice. If processing fails, the route deletes the row so Stripe's retry is processed.
-- Until this is applied, the route logs and processes without the dedupe (it handles 42P01/PGRST205),
-- so code can ship first.
--
-- Server-only: RLS on with no policies, no client grants. service_role (the webhook) bypasses RLS.
-- Stores ids/types only, no payloads or PII. Retention: rows are tiny; prune > 90 days later via
-- run_retention if it ever matters on the free tier.
--
-- Needs Ren SIGN before any hosted apply.

BEGIN;

CREATE TABLE IF NOT EXISTS public.stripe_events (
  id          text        PRIMARY KEY CHECK (id ~ '^evt_[A-Za-z0-9_]+$'),
  type        text        NOT NULL CHECK (length(type) BETWEEN 1 AND 128),
  received_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.stripe_events IS
  'Stripe webhook idempotency ledger (event id claimed before processing). Server-only.';

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.stripe_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.stripe_events TO service_role;

CREATE INDEX IF NOT EXISTS stripe_events_received_at_idx ON public.stripe_events (received_at);

COMMIT;

NOTIFY pgrst, 'reload schema';
