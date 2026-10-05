-- Hot-path indexes for Discover (discover_deals RPC) and state-scoped feeds.
--
-- discover_deals filters `active AND ask_price > 0`, optionally `location_state = p_state` /
-- `= ANY(p_states)`, then `ORDER BY last_seen_at DESC, id ASC LIMIT p_limit`. The RPC comment in
-- app/api/discover/route.ts relies on an `idx_deals_last_seen_active` partial index, but no
-- migration ever created it (it may exist on hosted from a manual apply). IF NOT EXISTS keeps this
-- idempotent either way.
--
-- deals is a few tens of thousands of thin rows, so a plain (non-concurrent) build is short and
-- runs inside the migration transaction.

CREATE INDEX IF NOT EXISTS idx_deals_last_seen_active
  ON public.deals (last_seen_at DESC, id)
  WHERE active AND ask_price > 0;

CREATE INDEX IF NOT EXISTS idx_deals_state_last_seen_active
  ON public.deals (location_state, last_seen_at DESC, id)
  WHERE active AND ask_price > 0;
