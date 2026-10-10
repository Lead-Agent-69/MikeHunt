-- saved_cars: close the PostgREST bypass of the read-time desk redaction, and make the table
-- server-write-only.
--
-- RLS policy "own_saved" (FOR ALL USING user_id = auth.uid()) plus the default table grants let a
-- signed-in user read their own rows straight from /rest/v1/saved_cars with the public anon key,
-- including the raw `snapshot` (seller contact, profit, max bid, cost estimates) and
-- `profit_at_save`, and write them directly. /api/saved-cars redacts those for non-flip desks on
-- read; this makes the API the only way to read or change them.
--
-- Verified before writing this: every saved_cars read and write in the app goes through the
-- service-role client (createServerComponentClient in app/api/saved-cars, app/api/save-from-url,
-- app/api/recommendations, lib/intelligence, lib/alerts, workers/ai-worker; createClient with
-- SUPABASE_SERVICE_ROLE_KEY in workers/savedCarsChecker and scripts/scrape-ci). No hook,
-- component or client lib module touches saved_cars. service_role bypasses these grants.
--
-- Knock-on: policy "own_vin_history" (20261010030000) reads saved_cars.snapshot in its USING
-- subquery, which runs with the caller's privileges. A direct anon/authenticated read of
-- vin_price_history therefore now fails closed with 42501. The app only touches vin_price_history
-- via the service role (save-from-url insert), so nothing breaks; if a client ever needs it,
-- move that check into a SECURITY DEFINER helper rather than re-granting snapshot.

REVOKE SELECT ON public.saved_cars FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.saved_cars FROM anon, authenticated;

GRANT SELECT (
  id,
  user_id,
  dealer_id,
  deal_id,
  source_url,
  source_name,
  notes,
  tags,
  status,
  price_at_save,
  last_price_seen,
  market_value_at_save,
  saved_at,
  last_checked,
  notified_unavailable
) ON public.saved_cars TO authenticated;

-- Self-check: fail the migration if a client role can still read the sensitive columns, read the
-- table wholesale (anon), or write it at all.
DO $$
DECLARE
  r text;
  c text;
  p text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH c IN ARRAY ARRAY['snapshot', 'profit_at_save'] LOOP
      IF has_column_privilege(r, 'public.saved_cars', c, 'SELECT') THEN
        RAISE EXCEPTION 'saved_cars.% still SELECT-able by %', c, r;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(r, 'public.saved_cars', p) THEN
        RAISE EXCEPTION 'saved_cars still % -able by %', p, r;
      END IF;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['INSERT', 'UPDATE'] LOOP
      IF has_any_column_privilege(r, 'public.saved_cars', p) THEN
        RAISE EXCEPTION 'saved_cars still has column-level % for %', p, r;
      END IF;
    END LOOP;
  END LOOP;
  IF has_table_privilege('anon', 'public.saved_cars', 'SELECT') THEN
    RAISE EXCEPTION 'saved_cars still table-wide SELECT-able by anon';
  END IF;
END $$;
