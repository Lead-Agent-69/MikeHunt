begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Market pagination orders by id and includes unpriced inventory, so the older
-- ask_price > 0 indexes cannot serve it. Avoid decompressing photoAudit JSON
-- again for every skipped row on every page of a full-market scan.
create index deals_market_visible_id_idx
  on public.deals (id, last_seen_at, auction_end_at)
  where active = true and images is not null and images <> '{}'::text[]
    and ((options->'photoAudit'->>'state') is null
      or (options->'photoAudit'->>'state') <> 'unavailable');

comment on index public.deals_market_visible_id_idx is
  'Full photo-bearing inventory paging, including unpriced rows. Time eligibility remains evaluated at request time.';
commit;
