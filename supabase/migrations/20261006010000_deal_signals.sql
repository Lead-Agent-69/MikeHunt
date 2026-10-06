-- View signals for the recommendation loop (lib/intelligence/affinity.ts).
--
-- One compact row per signal: open, dwell, save, unsave, dismiss, interest_yes, interest_no. The
-- listing attributes are a SNAPSHOT (make/model/year/price/body/state/source/title class), so a
-- signal still teaches after the deal row is pruned by listing retention. No FK to deals on
-- purpose. No photos, no HTML, no free text.
--
-- Size: ~120 bytes/row + indexes. Raw rows are pruned after 90 days and capped at 2,000 per user
-- (prune_deal_signals below), so a heavy user costs well under 1 MB.
--
-- WRITE PATH: /api/reco/signal (signed-in only) with the service role. No insert policy for
-- anon/authenticated, so clients cannot forge another user's signals.
-- READ PATH: a user may read their own rows; the API reads with the service role.

CREATE TABLE IF NOT EXISTS public.deal_signals (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id     UUID,
  kind        TEXT NOT NULL CHECK (kind IN (
                'open', 'dwell', 'save', 'unsave', 'dismiss', 'interest_yes', 'interest_no')),
  dwell_ms    INTEGER CHECK (dwell_ms IS NULL OR (dwell_ms >= 0 AND dwell_ms <= 3600000)),
  make        TEXT CHECK (make IS NULL OR length(make) <= 40),
  model       TEXT CHECK (model IS NULL OR length(model) <= 60),
  year        SMALLINT,
  price       INTEGER,
  body        TEXT CHECK (body IS NULL OR length(body) <= 40),
  state       CHAR(2),
  source      TEXT CHECK (source IS NULL OR length(source) <= 40),
  title_class TEXT CHECK (title_class IS NULL OR length(title_class) <= 16),
  facet       TEXT CHECK (facet IS NULL OR length(facet) <= 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_signals_user_created_idx
  ON public.deal_signals (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS deal_signals_created_idx
  ON public.deal_signals (created_at);

ALTER TABLE public.deal_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deal_signals_read_own" ON public.deal_signals;
CREATE POLICY "deal_signals_read_own" ON public.deal_signals
  FOR SELECT USING (user_id = auth.uid());

-- Retention: drop raw signals older than keep_days, then keep only the newest max_per_user rows
-- per user. Returns rows deleted. Service role only.
CREATE OR REPLACE FUNCTION public.prune_deal_signals(
  keep_days INTEGER DEFAULT 90,
  max_per_user INTEGER DEFAULT 2000
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  aged INTEGER := 0;
  capped INTEGER := 0;
BEGIN
  DELETE FROM public.deal_signals
   WHERE created_at < now() - make_interval(days => GREATEST(keep_days, 7));
  GET DIAGNOSTICS aged = ROW_COUNT;

  DELETE FROM public.deal_signals s
   USING (
     SELECT id FROM (
       SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
         FROM public.deal_signals
     ) ranked
     WHERE ranked.rn > GREATEST(max_per_user, 100)
   ) extra
   WHERE s.id = extra.id;
  GET DIAGNOSTICS capped = ROW_COUNT;

  RETURN aged + capped;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_deal_signals(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_deal_signals(INTEGER, INTEGER) TO service_role;

COMMENT ON TABLE public.deal_signals IS
  'Compact per-user view signals for recommendations. Snapshot attrs, no FK to deals. Service-role writes; pruned at 90d / 2000 rows per user by prune_deal_signals().';
