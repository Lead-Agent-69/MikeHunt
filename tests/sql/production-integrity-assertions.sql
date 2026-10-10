DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.deals WHERE active OR NOT access_hold) THEN RAISE EXCEPTION 'legacy inventory leaked'; END IF;
END $$;
INSERT INTO public.source_access_grants VALUES
  ('dealer', 'dealer.example', 'feed', 'https://dealer.example/authorization', now() - interval '1 day', now() + interval '1 day', true, true, true, '2026-10-integrity-v1');
INSERT INTO public.deals (source_url, active, true_net_profit) VALUES ('https://dealer.example/car', true, 1000), ('https://sibling.dealer.example/car', true, 2000);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.deals WHERE source_url = 'https://dealer.example/car' AND active AND NOT access_hold AND true_net_profit = 1000) THEN RAISE EXCEPTION 'approved offer not accepted'; END IF;
  IF EXISTS (SELECT 1 FROM public.deals WHERE source_url LIKE '%sibling%' AND active) THEN RAISE EXCEPTION 'sibling inherited permission'; END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.deals) <> 1 THEN RAISE EXCEPTION 'public hold isolation failed'; END IF;
END $$;
RESET ROLE;
UPDATE public.deals SET ask_price = 10000 WHERE source_url = 'https://dealer.example/car';
UPDATE public.deals SET ask_price = 10000 WHERE source_url = 'https://dealer.example/car';
UPDATE public.deals SET ask_price = 9000 WHERE source_url = 'https://dealer.example/car';
DO $$ BEGIN
  IF (SELECT count(*) FROM public.price_history) <> 2 THEN RAISE EXCEPTION 'unchanged price created extra history'; END IF;
END $$;
INSERT INTO public.deals (source_url, vin, make, model, year) VALUES
  ('https://dealer.example/offer1', '1HGCM82633A004352', 'Honda', 'Accord', 2003),
  ('https://dealer.example/offer2', '1HGCM82633A004352', 'honda', 'accord', 2003),
  ('https://dealer.example/conflict', '1HGCM82633A004352', 'Ford', 'Focus', 2010);
SELECT public.detect_duplicates_by_vin(ARRAY['1HGCM82633A004352']);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.deals WHERE duplicate_of_id IS NOT NULL) <> 1 THEN RAISE EXCEPTION 'compatible VIN grouping failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.deals WHERE source_url LIKE '%conflict' AND duplicate_of_id IS NOT NULL) THEN RAISE EXCEPTION 'VIN conflict auto merged'; END IF;
END $$;
UPDATE public.source_access_grants SET can_collect = false WHERE source_id = 'dealer';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.deals WHERE active OR NOT access_hold) THEN RAISE EXCEPTION 'revocation not applied'; END IF;
END $$;
SET ROLE anon;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.deals) THEN RAISE EXCEPTION 'revoked inventory visible'; END IF;
END $$;
RESET ROLE;
SELECT 'production integrity database assertions passed' AS result;
