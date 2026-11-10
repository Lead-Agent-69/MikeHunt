-- Run on a disposable database after the protected retention fixture.
CREATE TABLE public.price_history (
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  amount integer NOT NULL
);
ALTER TABLE public.deals ADD COLUMN computed integer
  GENERATED ALWAYS AS (ask_price::integer + 1) STORED;
GRANT SELECT, INSERT ON public.deals TO service_role;
GRANT SELECT, INSERT, DELETE ON public.price_history TO service_role;
GRANT SELECT ON public.source_url_cache TO service_role;

INSERT INTO public.deals (source, source_deal_id, last_seen_at, ask_price)
SELECT 'fixture', n::text, now() - interval '40 days', 100 FROM generate_series(1, 102) n;
INSERT INTO public.saved_cars (deal_id)
SELECT id FROM public.deals WHERE source_deal_id = '101';
INSERT INTO public.price_history
SELECT id, 100 FROM public.deals WHERE source_deal_id = '102';

SET statement_timeout = '15s';
SET ROLE service_role;
DO $$
DECLARE
  payload jsonb := inventory_archive.prepare_canary();
  batch uuid := gen_random_uuid();
  checksum text := repeat('a',64);
  first_id uuid := (payload->0->>'id')::uuid;
  item jsonb;
BEGIN
  IF jsonb_array_length(payload) <> 100 THEN RAISE EXCEPTION 'Wrong candidate count'; END IF;
  UPDATE public.deals SET last_seen_at = now() WHERE id = first_id;
  BEGIN
    PERFORM inventory_archive.commit_canary(batch, checksum, payload);
    RAISE EXCEPTION 'Stale payload was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Canary eligibility changed' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM inventory_archive.listings) <> 0 THEN
    RAISE EXCEPTION 'Partial commit after stale observation';
  END IF;
  UPDATE public.deals SET last_seen_at = (payload->0->>'last_seen_at')::timestamptz WHERE id = first_id;
  INSERT INTO public.price_history VALUES (first_id, 101);
  BEGIN
    PERFORM inventory_archive.commit_canary(batch, checksum, payload);
    RAISE EXCEPTION 'Late protected reference was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Canary eligibility changed' THEN RAISE; END IF;
  END;
  IF (SELECT count(*) FROM public.deals) <> 102
     OR (SELECT count(*) FROM public.price_history) <> 2
     OR (SELECT count(*) FROM inventory_archive.listings) <> 0 THEN
    RAISE EXCEPTION 'Late reference rejection was not atomic';
  END IF;
  DELETE FROM public.price_history WHERE deal_id = first_id;
  IF inventory_archive.commit_canary(batch, checksum, payload) <> 100 THEN
    RAISE EXCEPTION 'Wrong archived count';
  END IF;
  IF (SELECT count(*) FROM public.deals) <> 2
     OR (SELECT count(*) FROM public.saved_cars) <> 1
     OR (SELECT count(*) FROM public.price_history) <> 1 THEN
    RAISE EXCEPTION 'Protected history changed';
  END IF;
  BEGIN
    PERFORM inventory_archive.restore_listing((payload->0) || '{"ask_price":999}');
    RAISE EXCEPTION 'Tampered payload was accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Archive row checksum mismatch' THEN RAISE; END IF;
  END;
  FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
    PERFORM inventory_archive.restore_listing(item);
  END LOOP;
  IF (SELECT count(*) FROM public.deals) <> 102
     OR (SELECT count(*) FROM inventory_archive.listings) <> 0 THEN
    RAISE EXCEPTION 'Restore lost archive rows';
  END IF;
END;
$$;
RESET ROLE;
DO $$ BEGIN
  IF has_schema_privilege('anon', 'inventory_archive', 'USAGE')
     OR has_schema_privilege('authenticated', 'inventory_archive', 'USAGE') THEN
    RAISE EXCEPTION 'Archive schema must remain private';
  END IF;
END $$;
