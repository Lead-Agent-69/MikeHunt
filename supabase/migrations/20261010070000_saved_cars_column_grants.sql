-- saved_cars: close the PostgREST bypass of the read-time desk redaction.
--
-- RLS policy "own_saved" (FOR ALL USING user_id = auth.uid()) plus the default table grant let a
-- signed-in user read their own rows straight from /rest/v1/saved_cars with the public anon key,
-- including the raw `snapshot` (seller contact, profit, max bid, cost estimates) and
-- `profit_at_save`. /api/saved-cars redacts those for non-flip desks on read; this makes the API the
-- only way to read them. The app reads saved_cars exclusively through the service-role server
-- client, so nothing in the UI depends on the revoked columns.

REVOKE SELECT ON public.saved_cars FROM anon, authenticated;

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

-- Fail the migration if a sensitive column is still readable by a client role.
DO $$
DECLARE
  leaked text;
BEGIN
  SELECT string_agg(DISTINCT grantee || '.' || column_name, ', ')
    INTO leaked
    FROM information_schema.column_privileges
   WHERE table_schema = 'public'
     AND table_name = 'saved_cars'
     AND privilege_type = 'SELECT'
     AND grantee IN ('anon', 'authenticated')
     AND column_name IN ('snapshot', 'profit_at_save');
  IF leaked IS NOT NULL THEN
    RAISE EXCEPTION 'saved_cars sensitive columns still client-readable: %', leaked;
  END IF;
END $$;
