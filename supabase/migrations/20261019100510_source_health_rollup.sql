begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Source health used to download as many as 20,000 wide deals rows into a
-- Vercel function and aggregate them in JavaScript. Keep the same field proof,
-- but send one compact row per source/adapter/host/state/seller-type group.
-- The service-role-only caller maps shared importer rows back to their concrete
-- source id, so this function deliberately returns raw provenance dimensions.
create or replace function public.scrape_health_inventory_rollup(
  p_sources text[]
)
returns table(
  source text,
  adapter_id text,
  source_host text,
  location_state text,
  seller_type text,
  active_rows bigint,
  rows_with_photos bigint,
  photos bigint,
  vin bigint,
  title bigint,
  mileage bigint,
  damage bigint,
  price bigint,
  location bigint,
  seller bigint,
  explicit_seller_identity bigint,
  explicit_seller_contact bigint,
  auction_date bigint,
  source_link bigint,
  newest_seen timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with normalized as (
    select
      d.source::text as source,
      lower(btrim(coalesce(
        nullif(d.options ->> 'sourceAdapterId', ''),
        nullif(d.options ->> 'aggregator', ''),
        ''
      ))) as adapter_id,
      lower(regexp_replace(
        split_part(
          split_part(
            regexp_replace(btrim(coalesce(d.source_url, '')), '^https?://', '', 'i'),
            '/',
            1
          ),
          ':',
          1
        ),
        '^www\.',
        '',
        'i'
      )) as source_host,
      upper(btrim(coalesce(d.location_state, ''))) as location_state,
      lower(btrim(coalesce(nullif(d.options ->> 'sellerType', ''), ''))) as seller_type,
      coalesce(cardinality(array_remove(d.images, '')), 0) > 0 as has_photos,
      nullif(btrim(d.vin), '') is not null as has_vin,
      (
        d.condition is not null
        or coalesce(d.title, '') ~* '(salvage|rebuilt|clean title|parts)'
      ) as has_title,
      coalesce(d.mileage, 0) > 0 as has_mileage,
      (d.condition is not null or nullif(btrim(d.damage_type::text), '') is not null) as has_damage,
      coalesce(d.ask_price, 0) > 0 as has_price,
      (
        nullif(btrim(d.location_city), '') is not null
        or nullif(btrim(d.location_state), '') is not null
      ) as has_location,
      (
        nullif(btrim(d.options #>> '{contact,phone}'), '') is not null
        or nullif(btrim(d.options #>> '{contact,email}'), '') is not null
      ) as has_explicit_seller_identity,
      (
        nullif(btrim(d.options #>> '{contact,phone}'), '') is not null
        or nullif(btrim(d.options #>> '{contact,email}'), '') is not null
        or nullif(btrim(d.options #>> '{contact,url}'), '') is not null
      ) as has_explicit_seller_contact,
      d.auction_end_at is not null as has_auction_date,
      nullif(btrim(d.source_url), '') is not null as has_source_link,
      d.last_seen_at
    from public.deals d
    where d.active = true
      and d.source = any(coalesce(p_sources, '{}'::text[])::public.deal_source[])
  )
  select
    n.source,
    n.adapter_id,
    n.source_host,
    n.location_state,
    n.seller_type,
    count(*)::bigint as active_rows,
    count(*) filter (where n.has_photos)::bigint as rows_with_photos,
    count(*) filter (where n.has_photos)::bigint as photos,
    count(*) filter (where n.has_vin)::bigint as vin,
    count(*) filter (where n.has_title)::bigint as title,
    count(*) filter (where n.has_mileage)::bigint as mileage,
    count(*) filter (where n.has_damage)::bigint as damage,
    count(*) filter (where n.has_price)::bigint as price,
    count(*) filter (where n.has_location)::bigint as location,
    count(*)::bigint as seller,
    count(*) filter (where n.has_explicit_seller_identity)::bigint as explicit_seller_identity,
    count(*) filter (where n.has_explicit_seller_contact)::bigint as explicit_seller_contact,
    count(*) filter (where n.has_auction_date)::bigint as auction_date,
    count(*) filter (where n.has_source_link)::bigint as source_link,
    max(n.last_seen_at) as newest_seen
  from normalized n
  group by n.source, n.adapter_id, n.source_host, n.location_state, n.seller_type;
$$;

comment on function public.scrape_health_inventory_rollup(text[]) is
  'Service-only aggregate proof for source health. Avoids transferring wide deal rows to Vercel.';

revoke all on function public.scrape_health_inventory_rollup(text[])
  from public, anon, authenticated;
grant execute on function public.scrape_health_inventory_rollup(text[])
  to service_role;

commit;
