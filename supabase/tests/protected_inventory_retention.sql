-- Run after the migration, inside BEGIN/ROLLBACK on a disposable/local database only.
DO $$
DECLARE
  uid uuid := gen_random_uuid();
  did uuid;
  protected uuid[] := '{}';
  i integer;
  outcome jsonb;
  previous_timeout text := current_setting('statement_timeout');
  timeout_value text;
  stale_active uuid := gen_random_uuid();
BEGIN
  IF has_function_privilege('anon', 'public.prune_inventory_retention(integer)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.prune_inventory_retention(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public maintenance privilege';
  END IF;
  IF has_function_privilege('anon', 'public.inventory_storage_bytes()', 'EXECUTE')
    OR has_function_privilege('authenticated', 'public.inventory_storage_bytes()', 'EXECUTE') THEN
    RAISE EXCEPTION 'Public size RPC privilege';
  END IF;
  INSERT INTO auth.users(id,email) VALUES (uid,uid || '@example.invalid');
  INSERT INTO public.profiles(id,email) VALUES(uid,uid || '@example.invalid') ON CONFLICT DO NOTHING;
  FOR i IN 1..6 LOOP
    did := gen_random_uuid();
    protected := array_append(protected, did);
    INSERT INTO public.deals(id,source,source_deal_id,source_url,title,year,make,model,condition,ask_price,active,last_seen_at)
    VALUES(did,'independent_dealer','retention-test-' || did,'https://example.invalid/' || did,
      'Retention test',2020,'Test','Test','clean_title',10000,false,now()-interval '2 years');
    CASE i
      WHEN 1 THEN INSERT INTO public.saved_cars(user_id,deal_id,snapshot) VALUES(uid,did,'{"title":"kept"}');
      WHEN 2 THEN INSERT INTO public.watchlist(user_id,deal_id) VALUES(uid,did);
      WHEN 3 THEN INSERT INTO public.inventory(dealer_id,deal_id,vin,year,make,model) VALUES(uid,did,did::text,2020,'Test','Test');
      WHEN 4 THEN INSERT INTO public.deal_outcomes(user_id,deal_id,purchase_price) VALUES(uid,did,10000);
      WHEN 5 THEN INSERT INTO public.dealer_deals(user_id,deal_id) VALUES(uid,did);
      WHEN 6 THEN INSERT INTO public.alert_matches(deal_id) VALUES(did);
    END CASE;
    DELETE FROM public.deals WHERE id=did;
    IF NOT EXISTS (SELECT 1 FROM public.deals WHERE id=did) THEN
      RAISE EXCEPTION 'Delete guard failed for reference type %', i;
    END IF;
  END LOOP;
  did := gen_random_uuid();
  INSERT INTO public.deals(id,source,source_deal_id,source_url,title,year,make,model,condition,ask_price,active,last_seen_at)
  VALUES(did,'independent_dealer','retention-test-' || did,'https://example.invalid/' || did,
    'Retention test',2020,'Test','Test','clean_title',10000,false,'1900-01-01');
  outcome := public.prune_inventory_retention(1);
  IF (outcome->>'deleted')::integer > 1 THEN RAISE EXCEPTION 'Unbounded cleanup'; END IF;
  IF EXISTS (SELECT 1 FROM public.deals WHERE id=did) THEN RAISE EXCEPTION 'Unsaved old row not pruned'; END IF;
  IF (SELECT count(*) FROM public.deals WHERE id=ANY(protected)) <> 6 THEN RAISE EXCEPTION 'Protected rows pruned'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saved_cars WHERE user_id=uid AND snapshot->>'title'='kept' AND deal_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Saved snapshot/reference changed';
  END IF;
  INSERT INTO public.deals(id,source,source_deal_id,source_url,title,year,make,model,condition,ask_price,active,last_seen_at)
  VALUES(stale_active,'independent_dealer','timeout-' || stale_active,'https://example.invalid/' || stale_active,
    'Timeout guard',2020,'Test','Test','clean_title',10000,true,now()-interval '40 days');
  FOREACH timeout_value IN ARRAY ARRAY['0','16s'] LOOP
    PERFORM set_config('statement_timeout',timeout_value,true);
    BEGIN
      PERFORM public.prune_inventory_retention(1);
      RAISE EXCEPTION 'Unbounded timeout accepted';
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM <> 'Retention requires a pre-statement timeout between 1 and 15000 ms' THEN RAISE; END IF;
    END;
    IF NOT EXISTS(SELECT 1 FROM public.deals WHERE id=stale_active AND active) THEN
      RAISE EXCEPTION 'Timeout guard allowed mutation';
    END IF;
  END LOOP;
  PERFORM set_config('statement_timeout',previous_timeout,true);
  INSERT INTO public.source_url_cache(url_hash,url,expires_at)
  SELECT uid || '-' || seq.n, 'https://retention-cache.invalid/' || uid || '/' || seq.n, '1900-01-01'::timestamptz
  FROM generate_series(1,1205) seq(n);
  INSERT INTO public.source_url_cache(url_hash,url,expires_at)
  VALUES(uid || '-fresh','https://retention-cache.invalid/' || uid || '/fresh','2099-01-01');
  outcome := public.prune_inventory_retention(1000);
  IF (outcome->>'url_cache_deleted')::integer > 1000 OR (outcome->>'url_cache_deleted')::integer < 1 THEN
    RAISE EXCEPTION 'Missing or unbounded URL cache cleanup receipt';
  END IF;
  IF (SELECT count(*) FROM public.source_url_cache WHERE url_hash LIKE uid || '-%') < 206 THEN
    RAISE EXCEPTION 'URL cache batch removed too many records';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.source_url_cache WHERE url_hash=uid || '-fresh') THEN
    RAISE EXCEPTION 'Fresh URL cache row deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-dead-deals') THEN RAISE EXCEPTION 'Unsafe legacy cron survived'; END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-expired-deals' AND command ILIKE '%DELETE%vin_price_history%') THEN
    RAISE EXCEPTION 'Unprotected VIN history purge survived';
  END IF;
  IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='cleanup-expired-deals' AND command ILIKE '%DELETE%')
    OR NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='cleanup-expired-deals'
      AND command LIKE 'SET statement_timeout = ''15s''; SET lock_timeout = ''2s''; SELECT public.prune_inventory_retention(1000);') THEN
    RAISE EXCEPTION 'Cron execution boundary or bounded owner changed';
  END IF;
  BEGIN
    PERFORM public.prune_inventory_retention(2001);
    RAISE EXCEPTION 'Invalid limit accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Retention limit must be between 1 and 2000' THEN RAISE; END IF;
  END;
END $$;
