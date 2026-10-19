begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Source health is a buyer-readiness surface, not a raw retention counter.
-- Keep retained active rows visible to operations, but calculate readiness,
-- coverage and field completeness from the same current photo-backed window
-- used by Scan and Market Explorer.
create or replace function public.scrape_health_inventory_rollup_v2(
  p_sources text[]
)
returns table(
  source text,
  adapter_id text,
  source_host text,
  location_state text,
  seller_type text,
  active_rows bigint,
  stored_active_rows bigint,
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
  newest_seen timestamptz,
  newest_stored_seen timestamptz
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
      (
        d.last_seen_at >= now() - interval '72 hours'
        and d.last_seen_at <= now()
        and coalesce(cardinality(array_remove(d.images, '')), 0) > 0
        and coalesce(lower(btrim(d.options #>> '{photoAudit,state}')), '') <> 'unavailable'
        and (d.auction_end_at is null or d.auction_end_at > now())
      ) as customer_visible,
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
    count(*) filter (where n.customer_visible)::bigint as active_rows,
    count(*)::bigint as stored_active_rows,
    count(*) filter (where n.customer_visible and n.has_photos)::bigint as rows_with_photos,
    count(*) filter (where n.customer_visible and n.has_photos)::bigint as photos,
    count(*) filter (where n.customer_visible and n.has_vin)::bigint as vin,
    count(*) filter (where n.customer_visible and n.has_title)::bigint as title,
    count(*) filter (where n.customer_visible and n.has_mileage)::bigint as mileage,
    count(*) filter (where n.customer_visible and n.has_damage)::bigint as damage,
    count(*) filter (where n.customer_visible and n.has_price)::bigint as price,
    count(*) filter (where n.customer_visible and n.has_location)::bigint as location,
    count(*) filter (where n.customer_visible)::bigint as seller,
    count(*) filter (where n.customer_visible and n.has_explicit_seller_identity)::bigint
      as explicit_seller_identity,
    count(*) filter (where n.customer_visible and n.has_explicit_seller_contact)::bigint
      as explicit_seller_contact,
    count(*) filter (where n.customer_visible and n.has_auction_date)::bigint as auction_date,
    count(*) filter (where n.customer_visible and n.has_source_link)::bigint as source_link,
    max(n.last_seen_at) filter (where n.customer_visible) as newest_seen,
    max(n.last_seen_at) as newest_stored_seen
  from normalized n
  group by n.source, n.adapter_id, n.source_host, n.location_state, n.seller_type;
$$;

comment on function public.scrape_health_inventory_rollup_v2(text[]) is
  'Service-only source-health proof. Separates current buyer-visible inventory from retained active storage rows.';

revoke all on function public.scrape_health_inventory_rollup_v2(text[])
  from public, anon, authenticated;
grant execute on function public.scrape_health_inventory_rollup_v2(text[])
  to service_role;

commit;
