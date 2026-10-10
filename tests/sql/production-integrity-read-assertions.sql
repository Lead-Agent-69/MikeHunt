DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.eligible_deals) THEN RAISE EXCEPTION 'revoked service-role inventory leaked'; END IF;
END $$;
UPDATE public.source_access_grants SET can_collect = true WHERE source_id = 'dealer';
UPDATE public.deals SET active = true WHERE source_url LIKE 'https://dealer.example/%';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.eligible_deals) THEN RAISE EXCEPTION 'approved inventory not visible'; END IF;
END $$;
UPDATE public.source_access_grants SET expires_at = now() - interval '1 second', reviewed_at = now() - interval '1 day';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.eligible_deals) THEN RAISE EXCEPTION 'expired service-role inventory leaked'; END IF;
  IF EXISTS (SELECT 1 FROM public.eligible_price_history) THEN RAISE EXCEPTION 'expired derivative history leaked'; END IF;
  IF public.landing_proof() <> 0 THEN RAISE EXCEPTION 'RPC returned expired inventory'; END IF;
  IF public.match_deals() <> 0 THEN RAISE EXCEPTION 'qualified RPC returned expired inventory'; END IF;
END $$;
SELECT 'production integrity read assertions passed' AS result;
