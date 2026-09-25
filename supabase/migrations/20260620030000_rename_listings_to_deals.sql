-- Rename public.listings to public.deals across the schema
-- This updates the table, foreign key columns, indexes, policies, functions, triggers, and realtime publication.

-- 1. Rename the main table
alter table public.listings rename to deals;

-- 2. Rename columns that are foreign keys to the old listings table
alter table public.price_history rename column listing_id to deal_id;
alter table public.watchlist rename column listing_id to deal_id;
alter table public.alert_log rename column listing_id to deal_id;
alter table public.alert_matches rename column listing_id to deal_id;

-- inventory.vehicle_id points to listings.id; rename it to deal_id to match the new table
alter table public.inventory rename column vehicle_id to deal_id;

-- 3. Rename indexes on the old listings table (constraints tied to table are auto-renamed, but custom index names are not)
alter index if exists listings_source_idx rename to deals_source_idx;
alter index if exists listings_state_idx rename to deals_state_idx;
alter index if exists listings_make_idx rename to deals_make_idx;
alter index if exists listings_profit_idx rename to deals_profit_idx;
alter index if exists listings_score_idx rename to deals_score_idx;
alter index if exists listings_end_idx rename to deals_end_idx;
alter index if exists listings_geo_idx rename to deals_geo_idx;
alter index if exists listings_title_trgm rename to deals_title_trgm;
alter index if exists listings_vin_idx rename to deals_vin_idx;
alter index if exists listings_duplicate_idx rename to deals_duplicate_idx;
alter index if exists listings_arbitrage_idx rename to deals_arbitrage_idx;
alter index if exists listings_embedding_idx rename to deals_embedding_idx;
alter index if exists price_history_listing_idx rename to price_history_deal_idx;

-- 4. Rename unique constraint on deals
alter table public.deals rename constraint listings_source_source_listing_id_key to deals_source_source_deal_id_key;

-- 5. Rename RLS policies
alter policy "Anyone can view active listings" on public.deals rename to "Anyone can view active deals";

-- 6. Rename functions that reference the old listings table
-- drop old, recreate with new name

drop function if exists public.search_listings(text);
create or replace function public.search_deals(query text)
returns setof public.deals
language sql stable as $$
  select * from public.deals
  where active = true
    and (
      title ilike '%' || query || '%'
      or make ilike '%' || query || '%'
      or model ilike '%' || query || '%'
      or vin ilike '%' || query || '%'
    )
  order by profit_score desc nulls last, profit_estimate desc nulls last;
$$;

drop function if exists public.match_listings(vector(768), float, int);
create or replace function public.match_deals(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table(id uuid, title text, similarity float)
language sql stable as $$
  select
    id,
    title,
    1 - (deals.embedding <=> query_embedding) as similarity
  from public.deals
  where 1 - (deals.embedding <=> query_embedding) > match_threshold
  order by deals.embedding <=> query_embedding
  limit match_count;
$$;

-- 7. Update price-drop trigger to reference deals and deal_id
-- We recreate the trigger function so it points to the new table and column names.

-- Drop old trigger first
-- Note: the trigger function is in the price-drops migration. We replace it.

-- Create a helper function that centralizes the duplicate detection logic
-- (already exists as detect_duplicates_by_vin; we keep it and rename its internal references)
create or replace function public.detect_duplicates_by_vin(vin_filter text[] default null)
returns void
language plpgsql
as $$
BEGIN
    UPDATE public.deals d
    SET duplicate_of_id = c.canonical_id,
        duplicate_confidence = 1.0
    FROM (
        SELECT vin, MIN(id) AS canonical_id
        FROM public.deals
        WHERE vin IS NOT NULL
          AND duplicate_of_id IS NULL
          AND (vin_filter IS NULL OR vin = ANY(vin_filter))
        GROUP BY vin
        HAVING COUNT(*) > 1
    ) c
    WHERE d.vin = c.vin
      AND d.id <> c.canonical_id;
END;
$$;

-- Update the price-drop trigger function to use deal_id
CREATE OR REPLACE FUNCTION public.record_price_drop_alert()
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
    WHERE deal_id = NEW.deal_id
      AND id <> NEW.id
    ORDER BY observed_at DESC
    LIMIT 1;

    IF prev_price IS NOT NULL AND NEW.price < prev_price THEN
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
            INSERT INTO public.alert_log (user_id, deal_id, alert_type, old_price, new_price, drop_amount, drop_percentage, message)
            VALUES (
                watcher.user_id,
                NEW.deal_id,
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

-- 8. Update realtime publication
-- Remove the table from the publication if it exists, then re-add it under the new name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'deals'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime DROP TABLE public.deals';
  END IF;
END $$;
alter publication supabase_realtime add table public.deals;

-- 9. Rename scraper_runs counter columns
alter table public.scraper_runs rename column listings_found to deals_found;
alter table public.scraper_runs rename column listings_new to deals_new;
alter table public.scraper_runs rename column listings_updated to deals_updated;

-- 10. Rename enum listing_source -> deal_source
-- This is a typed dependency used by the deals table and other places.
-- PostgreSQL supports renaming enums with ALTER TYPE.
alter type public.listing_source rename to deal_source;

-- 11. Rename columns on the deals table that still have 'listing' in the name
alter table public.deals rename column source_listing_id to source_deal_id;

-- 12. Rename dealers.active_listings to active_deals
alter table public.dealers rename column active_listings to active_deals;

comment on table public.deals is 'Sourced vehicle deals from across the web';
