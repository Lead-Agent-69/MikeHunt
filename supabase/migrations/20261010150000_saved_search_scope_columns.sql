-- Saved searches: add the scope columns the /searches form has written since ec59d3d (2026-10-03).
--
-- /searches inserts `state`, `lane`, `seller_type` and `title_type` into public.user_saved_searches,
-- but no migration creates them, so every signed-in "Save search" insert fails with PGRST204
-- (PostgREST rejects unknown columns even when the value is NULL) and the page shows "Search was
-- not confirmed saved". Read-only hosted check (Management API, 2026-10-10 04:25 CT): all four are
-- missing on hosted too. Found by kera's E2E (create a saved search fails at desktop and 390px on
-- main, passes with this migration).
--
-- Scope: four nullable TEXT columns, NULL = "any" (all states / lanes / sellers / titles).
--   * No DEFAULT and no backfill: existing rows read as "any", which is what they meant.
--   * No GRANT / REVOKE of any kind, and nothing for anon. Privileges are owned by May's #317,
--     which is redoing this table's grants (revoke anon, column-limited authenticated grants):
--     #317's authenticated column list MUST include state, lane, seller_type, title_type, or saving
--     a search breaks again. #317 stacks on this migration and must sort after it.
--   * IF NOT EXISTS keeps a re-run (or a hand-applied column) harmless; the self-check below then
--     verifies the shape rather than trusting it.

BEGIN;

ALTER TABLE public.user_saved_searches
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS lane TEXT,
  ADD COLUMN IF NOT EXISTS seller_type TEXT,
  ADD COLUMN IF NOT EXISTS title_type TEXT;

COMMENT ON COLUMN public.user_saved_searches.state IS 'Two-letter state scope from /searches (NULL = all states).';
COMMENT ON COLUMN public.user_saved_searches.lane IS 'Buying lane slug from /searches (NULL = all lanes).';
COMMENT ON COLUMN public.user_saved_searches.seller_type IS 'dealer | private | auction (NULL = any seller).';
COMMENT ON COLUMN public.user_saved_searches.title_type IS 'clean | salvage (NULL = any title).';

-- Self-check: fail (and roll back) unless each column exists exactly as intended: TEXT, nullable,
-- no default, not generated/identity, and carrying no column-level ACL (this migration grants
-- nothing; column grants belong to #317).
DO $$
DECLARE
  c text;
  a record;
BEGIN
  FOREACH c IN ARRAY ARRAY['state', 'lane', 'seller_type', 'title_type'] LOOP
    SELECT att.atttypid, att.attnotnull, att.atthasdef, att.attgenerated, att.attidentity,
           att.attacl, att.attisdropped
      INTO a
      FROM pg_attribute att
     WHERE att.attrelid = 'public.user_saved_searches'::regclass
       AND att.attname = c
       AND att.attnum > 0
       AND NOT att.attisdropped;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'user_saved_searches.% missing after migration', c;
    END IF;
    IF a.atttypid <> 'text'::regtype THEN
      RAISE EXCEPTION 'user_saved_searches.% is %, expected text', c, format_type(a.atttypid, NULL);
    END IF;
    IF a.attnotnull THEN
      RAISE EXCEPTION 'user_saved_searches.% is NOT NULL, expected nullable', c;
    END IF;
    IF a.atthasdef OR a.attgenerated <> '' OR a.attidentity <> '' THEN
      RAISE EXCEPTION 'user_saved_searches.% has a default/generated/identity, expected none', c;
    END IF;
    IF a.attacl IS NOT NULL THEN
      RAISE EXCEPTION 'user_saved_searches.% carries a column ACL (%); this migration grants nothing', c, a.attacl;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- PostgREST caches the schema; reload so inserts see the new columns immediately.
NOTIFY pgrst, 'reload schema';
