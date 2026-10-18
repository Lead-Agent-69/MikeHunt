begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- The public newest-listing read includes unpriced inventory. The older
-- ask_price > 0 Discover indexes cannot serve that query. Include created_at
-- so headline active/added counts can also avoid reading wide listing rows.
create index deals_active_status_seen_idx
  on public.deals (last_seen_at desc) include (created_at)
  where active = true;

comment on index public.deals_active_status_seen_idx is
  'Public inventory status: newest observation and active/added counts, including unpriced listings.';
commit;
