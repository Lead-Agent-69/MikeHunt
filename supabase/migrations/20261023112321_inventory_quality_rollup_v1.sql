begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Historic JSON is untyped. A malformed source date must remove decision
-- eligibility, not abort the whole inventory/status audit.
create or replace function public.inventory_safe_timestamptz(value text)
returns timestamptz
language plpgsql
stable
strict
security invoker
set search_path = ''
as $$
begin
  return value::timestamptz;
exception
  when datetime_field_overflow or invalid_datetime_format then return null;
end;
$$;

revoke all on function public.inventory_safe_timestamptz(text)
  from public, anon, authenticated;
grant execute on function public.inventory_safe_timestamptz(text)
  to service_role;

-- A single bounded database scan replaces the legacy audit's repeated exact
-- counts and full VIN download. The result is operational metadata only and is
-- intentionally available to the worker service role, never browser clients.
create or replace function public.inventory_quality_rollup_v1()
returns table(
  checked_at timestamptz,
  total_rows bigint,
  active_rows bigint,
  current_visible_rows bigint,
  new_last_24h_rows bigint,
  new_last_7d_rows bigint,
  updated_last_24h_rows bigint,
  newest_visible_at timestamptz,
  retained_not_visible_rows bigint,
  inactive_rows bigint,
  unobserved_active_rows bigint,
  future_observation_active_rows bigint,
  stale_active_rows bigint,
  missing_photos_active_rows bigint,
  photos_unavailable_active_rows bigint,
  source_removed_active_rows bigint,
  ended_auction_active_rows bigint,
  missing_required_active_rows bigint,
  invalid_year_active_rows bigint,
  invalid_price_active_rows bigint,
  missing_price_active_rows bigint,
  invalid_mileage_active_rows bigint,
  missing_vin_active_rows bigint,
  duplicate_vin_rows bigint,
  missing_location_active_rows bigint,
  missing_profit_score_active_rows bigint,
  current_profit_modeled_rows bigint,
  current_resale_evidence_rows bigint,
  current_purchase_checks_complete_rows bigint,
  current_strict_buy_candidates bigint,
  current_geocoded_rows bigint,
  current_city_rows bigint,
  current_watch_candidate_rows bigint,
  current_market_value_backed_rows bigint,
  current_resale_estimate_backed_rows bigint,
  current_deal_math_ready_rows bigint,
  current_go_rows bigint,
  current_hold_rows bigint,
  current_pass_rows bigint,
  current_insufficient_rows bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select
      d.*,
      (
        d.active = true
        and d.last_seen_at >= now() - interval '72 hours'
        and d.last_seen_at <= now()
        and coalesce(cardinality(array_remove(d.images, '')), 0) > 0
        and coalesce(lower(btrim(d.options #>> '{photoAudit,state}')), '') <> 'unavailable'
        and coalesce(lower(btrim(d.options #>> '{sourceAvailability,state}')), '') <> 'removed'
        and (d.auction_end_at is null or d.auction_end_at > now())
      ) as customer_visible,
      upper(btrim(coalesce(d.vin, ''))) as normalized_vin,
      (d.deal_analysis #>> '{valuation,resaleEvidence}') = 'true' as resale_evidence,
      (
        (d.deal_analysis #>> '{evidenceGates,priceMeaningConfirmed}') = 'true'
        and (d.deal_analysis #>> '{evidenceGates,titleReviewed}') = 'true'
        and (d.deal_analysis #>> '{evidenceGates,conditionInspected}') = 'true'
        and (d.deal_analysis #>> '{evidenceGates,costsConfirmed}') = 'true'
      ) as purchase_checks_complete
    from public.deals d
  ),
  duplicate_vins as (
    select coalesce(sum(vin_count - 1), 0)::bigint as rows
    from (
      select count(*)::bigint as vin_count
      from base b
      where b.active = true
        and b.normalized_vin ~ '^[A-HJ-NPR-Z0-9]{17}$'
      group by b.normalized_vin
      having count(*) > 1
    ) grouped
  )
  select
    now() as checked_at,
    count(*)::bigint as total_rows,
    count(*) filter (where b.active = true)::bigint as active_rows,
    count(*) filter (where b.customer_visible)::bigint as current_visible_rows,
    count(*) filter (
      where b.customer_visible and b.created_at > now() - interval '24 hours'
    )::bigint as new_last_24h_rows,
    count(*) filter (
      where b.customer_visible and b.created_at > now() - interval '7 days'
    )::bigint as new_last_7d_rows,
    count(*) filter (
      where b.customer_visible and b.updated_at > now() - interval '24 hours'
    )::bigint as updated_last_24h_rows,
    max(b.last_seen_at) filter (where b.customer_visible) as newest_visible_at,
    count(*) filter (where b.active = true and not b.customer_visible)::bigint
      as retained_not_visible_rows,
    count(*) filter (where b.active is distinct from true)::bigint as inactive_rows,
    count(*) filter (where b.active = true and b.last_seen_at is null)::bigint
      as unobserved_active_rows,
    count(*) filter (where b.active = true and b.last_seen_at > now())::bigint
      as future_observation_active_rows,
    count(*) filter (
      where b.active = true and b.last_seen_at < now() - interval '72 hours'
    )::bigint as stale_active_rows,
    count(*) filter (
      where b.active = true
        and coalesce(cardinality(array_remove(b.images, '')), 0) = 0
    )::bigint as missing_photos_active_rows,
    count(*) filter (
      where b.active = true
        and lower(btrim(coalesce(b.options #>> '{photoAudit,state}', ''))) = 'unavailable'
    )::bigint as photos_unavailable_active_rows,
    count(*) filter (
      where b.active = true
        and lower(btrim(coalesce(b.options #>> '{sourceAvailability,state}', ''))) = 'removed'
    )::bigint as source_removed_active_rows,
    count(*) filter (
      where b.active = true and b.auction_end_at is not null and b.auction_end_at <= now()
    )::bigint as ended_auction_active_rows,
    count(*) filter (
      where b.active = true
        and (
          b.year is null
          or nullif(btrim(b.make), '') is null
          or nullif(btrim(b.model), '') is null
        )
    )::bigint as missing_required_active_rows,
    count(*) filter (
      where b.active = true
        and (b.year < 1900 or b.year > extract(year from now())::int + 2)
    )::bigint as invalid_year_active_rows,
    count(*) filter (
      where b.active = true and (b.ask_price < 100 or b.ask_price > 500000)
    )::bigint as invalid_price_active_rows,
    count(*) filter (
      where b.active = true and coalesce(b.ask_price, 0) <= 0
    )::bigint as missing_price_active_rows,
    count(*) filter (
      where b.active = true and b.mileage is not null
        and (b.mileage < 0 or b.mileage > 500000)
    )::bigint as invalid_mileage_active_rows,
    count(*) filter (
      where b.active = true and nullif(b.normalized_vin, '') is null
    )::bigint as missing_vin_active_rows,
    (select rows from duplicate_vins) as duplicate_vin_rows,
    count(*) filter (
      where b.active = true
        and nullif(btrim(coalesce(b.location_state, '')), '') is null
    )::bigint as missing_location_active_rows,
    count(*) filter (
      where b.active = true and b.profit_score is null
    )::bigint as missing_profit_score_active_rows,
    count(*) filter (
      where b.customer_visible
        and b.ask_price > 0
        and b.sell_estimate > 0
        and b.true_net_profit is not null
    )::bigint as current_profit_modeled_rows,
    count(*) filter (
      where b.customer_visible and b.resale_evidence
    )::bigint as current_resale_evidence_rows,
    count(*) filter (
      where b.customer_visible and b.purchase_checks_complete
    )::bigint as current_purchase_checks_complete_rows,
    count(*) filter (
      where b.customer_visible
        and b.deal_verdict = 'go'
        and b.ask_price > 0
        and b.sell_estimate > 0
        and b.true_net_profit is not null
        and b.normalized_vin ~ '^[A-HJ-NPR-Z0-9]{17}$'
        and b.mileage is not null and b.mileage >= 0
        and b.purchase_checks_complete
        and (b.deal_analysis #>> '{valuation,source}') = 'comparables'
        and (b.deal_analysis #>> '{valuation,confidence}') in ('high', 'medium')
        and case
          when coalesce(b.deal_analysis #>> '{valuation,compCount}', '') ~ '^[0-9]+$'
            then (b.deal_analysis #>> '{valuation,compCount}')::int
          else 0
        end >= 3
        and (b.deal_analysis #>> '{valuation,soldLane}') = 'clean'
        and (b.deal_analysis #>> '{valuation,soldAnchored}') = 'true'
        and case
          when coalesce(b.deal_analysis #>> '{valuation,soldCount}', '') ~ '^[0-9]+$'
            then (b.deal_analysis #>> '{valuation,soldCount}')::int
          else 0
        end >= 3
        and public.inventory_safe_timestamptz(
          nullif(b.deal_analysis #>> '{valuation,soldAt}', '')
        ) between now() - interval '180 days' and now()
        and coalesce(b.deal_analysis #>> '{priceImplausible}', 'false') <> 'true'
        and coalesce(b.options #>> '{priceEvidence,kind}', '') not in (
          'current_bid', 'reference', 'unknown', 'down_payment',
          'monthly_payment', 'finance_teaser'
        )
        and b.source::text not in (
          'copart', 'iaa', 'adesa', 'manheim', 'gov_auction', 'acv'
        )
    )::bigint as current_strict_buy_candidates,
    count(*) filter (
      where b.customer_visible and b.lat is not null and b.lng is not null
    )::bigint as current_geocoded_rows,
    count(*) filter (
      where b.customer_visible and nullif(btrim(coalesce(b.location_city, '')), '') is not null
    )::bigint as current_city_rows,
    count(*) filter (
      where b.customer_visible
        and b.ask_price >= 3000
        and b.sell_estimate > 0
        and b.true_net_profit is not null
        and b.true_net_profit < 0
    )::bigint as current_watch_candidate_rows,
    count(*) filter (
      where b.customer_visible and b.mmr_value > 0
    )::bigint as current_market_value_backed_rows,
    count(*) filter (
      where b.customer_visible and b.sell_estimate > 0
    )::bigint as current_resale_estimate_backed_rows,
    count(*) filter (
      where b.customer_visible
        and b.sell_estimate > 0
        and b.true_net_profit is not null
        and b.profit_score is not null
    )::bigint as current_deal_math_ready_rows,
    count(*) filter (where b.customer_visible and b.deal_verdict = 'go')::bigint
      as current_go_rows,
    count(*) filter (where b.customer_visible and b.deal_verdict = 'hold')::bigint
      as current_hold_rows,
    count(*) filter (where b.customer_visible and b.deal_verdict = 'pass')::bigint
      as current_pass_rows,
    count(*) filter (
      where b.customer_visible and b.deal_verdict = 'not_enough_data'
    )::bigint as current_insufficient_rows
  from base b;
$$;

comment on function public.inventory_quality_rollup_v1() is
  'Service-only, single-scan inventory quality, visibility and profitability-evidence audit.';

revoke all on function public.inventory_quality_rollup_v1()
  from public, anon, authenticated;
grant execute on function public.inventory_quality_rollup_v1()
  to service_role;

-- Keep the source-health rollup on the same fail-closed boundary. A repaired
-- row normally also has active=false, but the source marker protects against a
-- partial or concurrent write.
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
        and coalesce(lower(btrim(d.options #>> '{sourceAvailability,state}')), '') <> 'removed'
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
  'Service-only source-health proof aligned to the canonical buyer-visible inventory boundary.';

revoke all on function public.scrape_health_inventory_rollup_v2(text[])
  from public, anon, authenticated;
grant execute on function public.scrape_health_inventory_rollup_v2(text[])
  to service_role;

-- Market widgets previously treated every retained active row as live. Keep
-- their existing signatures and privileges, but align their inputs with the
-- same current, photo-backed, open-auction boundary as listing surfaces.
create or replace function public.get_market_pulse()
returns table(make text, model text, go_deals bigint, avg_profit numeric, avg_days int)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.make,
    d.model,
    count(*) filter (where d.deal_verdict = 'go') as go_deals,
    round(avg(d.true_net_profit) filter (where d.deal_verdict = 'go'), 0) as avg_profit,
    round(avg(extract(day from (now() - d.first_seen_at))))::int as avg_days
  from public.deals d
  where d.active = true
    and d.make is not null
    and d.model is not null
    and d.last_seen_at between now() - interval '72 hours' and now()
    and coalesce(cardinality(array_remove(d.images, '')), 0) > 0
    and coalesce(lower(btrim(d.options #>> '{photoAudit,state}')), '') <> 'unavailable'
    and coalesce(lower(btrim(d.options #>> '{sourceAvailability,state}')), '') <> 'removed'
    and (d.auction_end_at is null or d.auction_end_at > now())
  group by d.make, d.model
  having count(*) filter (where d.deal_verdict = 'go') > 3
  order by go_deals desc
  limit 12;
$$;

create or replace function public.get_profit_by_trim(p_make text, p_model text)
returns table(trim_name text, go_deals bigint, avg_profit numeric, avg_ask numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    d.trim as trim_name,
    count(*) filter (where d.deal_verdict = 'go') as go_deals,
    round(avg(d.true_net_profit) filter (where d.deal_verdict = 'go'), 0) as avg_profit,
    round(avg(d.ask_price), 0) as avg_ask
  from public.deals d
  where d.active = true
    and lower(d.make) = lower(p_make)
    and lower(d.model) like '%' || lower(p_model) || '%'
    and d.trim is not null
    and d.trim <> ''
    and d.last_seen_at between now() - interval '72 hours' and now()
    and coalesce(cardinality(array_remove(d.images, '')), 0) > 0
    and coalesce(lower(btrim(d.options #>> '{photoAudit,state}')), '') <> 'unavailable'
    and coalesce(lower(btrim(d.options #>> '{sourceAvailability,state}')), '') <> 'removed'
    and (d.auction_end_at is null or d.auction_end_at > now())
  group by d.trim
  order by avg_profit desc nulls last
  limit 12;
$$;

commit;
