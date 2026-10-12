-- Saved-search match tuning (production gap audit, section VI-B).
-- NOT applied automatically. Apply to hosted Supabase; until then the app behaves as before
-- (precision = standard, delivery = instant) and the thumbs/settings controls report a save error.

-- Per-search precision and delivery mode. See lib/alerts/saved-search-match.ts for exactly what
-- each precision value changes.
ALTER TABLE public.user_saved_searches
  ADD COLUMN IF NOT EXISTS match_precision TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'instant';

DO $$ BEGIN
  ALTER TABLE public.user_saved_searches
    ADD CONSTRAINT user_saved_searches_match_precision_check
    CHECK (match_precision IN ('looser', 'standard', 'tighter'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.user_saved_searches
    ADD CONSTRAINT user_saved_searches_delivery_mode_check
    CHECK (delivery_mode IN ('instant', 'digest'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Thumbs up/down on an alert match (+1 / -1, NULL = not rated) and the digest send stamp.
ALTER TABLE public.user_feed_inbox
  ADD COLUMN IF NOT EXISTS feedback SMALLINT,
  ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS digest_sent_at TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE public.user_feed_inbox
    ADD CONSTRAINT user_feed_inbox_feedback_check CHECK (feedback IN (-1, 1));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Digest scan: un-digested recent rows per search.
CREATE INDEX IF NOT EXISTS idx_feed_inbox_digest_pending
  ON public.user_feed_inbox (search_id, created_at)
  WHERE digest_sent_at IS NULL;

-- Existing RLS ("own_searches", "own_inbox": user_id = auth.uid(), FOR ALL) already scopes reads and
-- writes of these columns to the row owner. No new policies or grants.
