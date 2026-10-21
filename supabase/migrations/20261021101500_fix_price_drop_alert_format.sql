-- PostgreSQL format() supports %s, %I, and %L, but not printf-style numeric
-- precision specifiers. A watched vehicle price drop therefore
-- aborted the entire price_history insert batch. Format the percentage with
-- to_char() first so history collection and alerts remain atomic.
CREATE OR REPLACE FUNCTION public.record_price_drop_alert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
    prev_price INTEGER;
    watcher RECORD;
    drop_amount INTEGER;
    drop_pct NUMERIC(5,2);
BEGIN
    SELECT price INTO prev_price
    FROM public.price_history
    WHERE deal_id = NEW.deal_id
      AND id <> NEW.id
    ORDER BY observed_at DESC
    LIMIT 1;

    IF prev_price IS NOT NULL AND prev_price > 0 AND NEW.price < prev_price THEN
        drop_amount := prev_price - NEW.price;
        drop_pct := (drop_amount::numeric / prev_price) * 100;

        UPDATE public.deals
        SET last_price_change_at = NEW.observed_at
        WHERE id = NEW.deal_id;

        FOR watcher IN
            SELECT user_id, alert_threshold
            FROM public.watchlist
            WHERE deal_id = NEW.deal_id
              AND (alert_threshold IS NULL OR drop_amount >= alert_threshold)
        LOOP
            INSERT INTO public.alert_log (
                user_id,
                deal_id,
                alert_type,
                old_price,
                new_price,
                drop_amount,
                drop_percentage,
                message
            )
            VALUES (
                watcher.user_id,
                NEW.deal_id,
                'price_drop',
                prev_price,
                NEW.price,
                drop_amount,
                drop_pct,
                format(
                    'Price dropped $%s (%s%%)',
                    drop_amount,
                    to_char(drop_pct, 'FM999999990.0')
                )
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$;
