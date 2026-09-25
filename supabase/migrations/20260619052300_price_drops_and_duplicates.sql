-- Price drop alerts and duplicate detection schema

-- Track duplicate listings across sources
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS duplicate_of_id uuid;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS duplicate_confidence numeric(4,3);
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS last_price_change_at timestamptz;

CREATE INDEX IF NOT EXISTS listings_duplicate_idx ON public.listings(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

-- Alert log for price drops and other events
CREATE TABLE IF NOT EXISTS public.alert_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES auth.users(id) on delete cascade,
    listing_id uuid REFERENCES public.listings(id) on delete cascade,
    alert_type TEXT NOT NULL DEFAULT 'price_drop',
    old_price INTEGER,
    new_price INTEGER,
    drop_amount INTEGER,
    drop_percentage NUMERIC(5,2),
    message TEXT,
    sent_at TIMESTAMPTZ DEFAULT now(),
    read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS alert_log_user_idx ON public.alert_log(user_id, sent_at DESC);

ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own alerts"
    ON public.alert_log
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Function to detect duplicate listings by VIN
CREATE OR REPLACE FUNCTION detect_duplicates_by_vin(vin_filter TEXT[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.listings l
    SET duplicate_of_id = d.canonical_id,
        duplicate_confidence = 1.0
    FROM (
        SELECT vin, MIN(id) AS canonical_id
        FROM public.listings
        WHERE vin IS NOT NULL
          AND duplicate_of_id IS NULL
          AND (vin_filter IS NULL OR vin = ANY(vin_filter))
        GROUP BY vin
        HAVING COUNT(*) > 1
    ) d
    WHERE l.vin = d.vin
      AND l.id <> d.canonical_id
      AND l.duplicate_of_id IS NULL;
END;
$$;

-- Function to record price drops when price_history changes
CREATE OR REPLACE FUNCTION record_price_drop_alert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    prev_price INTEGER;
    watcher RECORD;
    drop_amount INTEGER;
    drop_pct NUMERIC(5,2);
BEGIN
    SELECT price INTO prev_price
    FROM public.price_history
    WHERE listing_id = NEW.listing_id
      AND id <> NEW.id
    ORDER BY observed_at DESC
    LIMIT 1;

    IF prev_price IS NOT NULL AND NEW.price < prev_price THEN
        drop_amount := prev_price - NEW.price;
        drop_pct := (drop_amount::numeric / prev_price) * 100;

        UPDATE public.listings
        SET last_price_change_at = NEW.observed_at
        WHERE id = NEW.listing_id;

        FOR watcher IN
            SELECT user_id, alert_threshold
            FROM public.watchlist
            WHERE listing_id = NEW.listing_id
              AND (alert_threshold IS NULL OR drop_amount >= alert_threshold)
        LOOP
            INSERT INTO public.alert_log (user_id, listing_id, alert_type, old_price, new_price, drop_amount, drop_percentage, message)
            VALUES (
                watcher.user_id,
                NEW.listing_id,
                'price_drop',
                prev_price,
                NEW.price,
                drop_amount,
                drop_pct,
                format('Price dropped $%s (%.1f%%)', drop_amount, drop_pct)
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS price_drop_alert_trigger ON public.price_history;
CREATE TRIGGER price_drop_alert_trigger
    AFTER INSERT ON public.price_history
    FOR EACH ROW
    EXECUTE FUNCTION record_price_drop_alert();
