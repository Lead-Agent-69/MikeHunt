-- Replaces conflicting legacy cleanup jobs. Saved user records have no age TTL.
-- INVOKER: only service_role may call maintenance; no privileged public RPC.
DO $$
DECLARE ref_table text;
BEGIN
  FOREACH ref_table IN ARRAY ARRAY['deals','saved_cars','watchlist','inventory',
    'deal_outcomes','dealer_deals','alert_matches','source_url_cache'] LOOP
    IF to_regclass('public.' || ref_table) IS NULL THEN
      RAISE EXCEPTION 'Protected retention prerequisite missing: %', ref_table;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.protect_referenced_deal_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.saved_cars WHERE deal_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.watchlist WHERE deal_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.inventory WHERE deal_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.deal_outcomes WHERE deal_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.dealer_deals WHERE deal_id = OLD.id)
    OR EXISTS (SELECT 1 FROM public.alert_matches WHERE deal_id = OLD.id)
  THEN RETURN NULL;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.protect_referenced_deal_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS protect_referenced_deal_delete ON public.deals;
CREATE TRIGGER protect_referenced_deal_delete BEFORE DELETE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.protect_referenced_deal_delete();

CREATE OR REPLACE FUNCTION public.prune_inventory_retention(p_limit integer DEFAULT 1000)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
SET lock_timeout = '2s' SET statement_timeout = '15s' AS $$
DECLARE
  ids uuid[];
  demoted integer;
  deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 2000 THEN
    RAISE EXCEPTION 'Retention limit must be between 1 and 2000';
  END IF;
  WITH stale AS (
    SELECT id FROM public.deals
    WHERE active = true AND last_seen_at < now() - interval '30 days'
    ORDER BY last_seen_at, id LIMIT p_limit FOR UPDATE SKIP LOCKED
  ) UPDATE public.deals d SET active = false FROM stale WHERE d.id = stale.id;
  GET DIAGNOSTICS demoted = ROW_COUNT;

  -- Lock before checking references. FK-based saves and collector updates share this row lock.
  SELECT array_agg(id) INTO ids FROM (
    SELECT d.id FROM public.deals d
    WHERE d.active = false AND d.last_seen_at < now() - interval '90 days'
      AND NOT EXISTS (SELECT 1 FROM public.saved_cars WHERE deal_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.watchlist WHERE deal_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.inventory WHERE deal_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.deal_outcomes WHERE deal_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.dealer_deals WHERE deal_id = d.id)
      AND NOT EXISTS (SELECT 1 FROM public.alert_matches WHERE deal_id = d.id)
    ORDER BY d.last_seen_at, d.id LIMIT p_limit FOR UPDATE OF d SKIP LOCKED
  ) candidates;
  -- The BEFORE DELETE guard checks again with a fresh command snapshot after locking.
  DELETE FROM public.deals WHERE id = ANY(ids)
    AND active = false AND last_seen_at < now() - interval '90 days';
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN jsonb_build_object('demoted', demoted, 'deleted', deleted,
    'database_bytes', pg_database_size(current_database()));
END;
$$;
REVOKE ALL ON FUNCTION public.prune_inventory_retention(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_inventory_retention(integer) TO service_role;
CREATE OR REPLACE FUNCTION public.inventory_storage_bytes()
RETURNS bigint LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT pg_database_size(current_database()); $$;
REVOKE ALL ON FUNCTION public.inventory_storage_bytes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_storage_bytes() TO service_role;
CREATE INDEX IF NOT EXISTS idx_deals_inactive_retention
  ON public.deals(last_seen_at, id) WHERE active = false;

DO $$
DECLARE caller_role text;
BEGIN
  FOREACH caller_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF has_function_privilege(caller_role,'public.prune_inventory_retention(integer)','EXECUTE')
      OR has_function_privilege(caller_role,'public.inventory_storage_bytes()','EXECUTE')
      OR has_function_privilege(caller_role,'public.protect_referenced_deal_delete()','EXECUTE') THEN
      RAISE EXCEPTION 'Public retention privilege survived for %', caller_role;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('service_role','public.prune_inventory_retention(integer)','EXECUTE')
    OR NOT has_function_privilege('service_role','public.inventory_storage_bytes()','EXECUTE') THEN
    RAISE EXCEPTION 'Service-only retention grants missing';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE prosecdef AND oid IN (
    'public.prune_inventory_retention(integer)'::regprocedure,
    'public.inventory_storage_bytes()'::regprocedure,
    'public.protect_referenced_deal_delete()'::regprocedure)) THEN
    RAISE EXCEPTION 'Retention functions must remain SECURITY INVOKER';
  END IF;
END $$;

-- These older jobs bypassed user-reference checks, or used a conflicting 30/60-day hard delete.
DO $$ BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
    WHERE jobname IN ('cleanup-expired-deals', 'cleanup-dead-deals');
  END IF;
END $$;
-- Keep disposable URL-cache cleanup, without raw listing/history deletes.
-- VIN price observations can back saved research; do not age-purge them until
-- an owner-aware archival policy is reviewed and tested independently.
DO $$ BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.schedule('cleanup-expired-deals', '0 2 * * *',
      'SELECT public.prune_inventory_retention(1000); DELETE FROM public.source_url_cache WHERE expires_at < now();');
  END IF;
END $$;
