-- Replaces conflicting legacy cleanup jobs. Saved user records have no age TTL.
-- INVOKER: only service_role may call maintenance; no privileged public RPC.
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

-- These older jobs bypassed user-reference checks, or used a conflicting 30/60-day hard delete.
DO $$ BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job
    WHERE jobname IN ('cleanup-expired-deals', 'cleanup-dead-deals');
  END IF;
END $$;
-- Keep auxiliary cleanup, without any raw DELETE FROM deals in a cron command.
DO $$ BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    PERFORM cron.schedule('cleanup-expired-deals', '0 2 * * *',
      'SELECT public.prune_inventory_retention(1000); DELETE FROM public.source_url_cache WHERE expires_at < now(); DELETE FROM public.vin_price_history WHERE recorded_at < now() - interval ''180 days'';');
  END IF;
END $$;
