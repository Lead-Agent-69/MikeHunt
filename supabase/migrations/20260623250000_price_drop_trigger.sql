-- A3: populate the price-drop signal. The DealCard "price dropped $X" badge reads
-- deals.price_drop_amount / price_drop_days — but those columns were NEVER added to prod, so the
-- badge has always been dead. Add them, then a BEFORE-UPDATE trigger records a drop whenever a
-- re-scrape lowers a listing's ask_price (real negotiation leverage), and clears it when the price
-- holds/rises so stale drops don't linger. The full price time-series already lives in price_history;
-- this is just the at-a-glance "recently dropped" summary the card reads.

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS price_drop_amount NUMERIC DEFAULT 0;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS price_drop_days INT;

CREATE OR REPLACE FUNCTION public.track_price_drop() RETURNS trigger AS $$
BEGIN
  IF NEW.ask_price IS NOT NULL AND OLD.ask_price IS NOT NULL
     AND NEW.ask_price < OLD.ask_price THEN
    -- Price dropped this cycle: record the delta and how long it had been listed at drop time.
    NEW.price_drop_amount := (OLD.ask_price - NEW.ask_price);
    NEW.price_drop_days := GREATEST(
      0,
      EXTRACT(DAY FROM (NOW() - COALESCE(NEW.first_seen_at, OLD.first_seen_at, NOW())))::INT
    );
  ELSIF NEW.ask_price IS NOT NULL AND OLD.ask_price IS NOT NULL
        AND NEW.ask_price >= OLD.ask_price THEN
    -- Price held or rose: clear any prior drop so the badge reflects current reality.
    NEW.price_drop_amount := 0;
    NEW.price_drop_days := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_price_drop ON public.deals;
CREATE TRIGGER trg_price_drop
  BEFORE UPDATE OF ask_price ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.track_price_drop();
