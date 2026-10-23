begin;
set local lock_timeout = '2s';
set local statement_timeout = '60s';

-- Keep the operational audit exact without repeatedly detoasting every wide
-- listing. Core integrity checks remain column-pruned and parallelizable;
-- valuation JSON is materialized only for current customer-visible inventory.
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
  with core_rows as not materialized (
    select
      prepared.*,
      (
        prepared.active = true
        and prepared.last_seen_at >= now() - interval '72 hours'
        and prepared.last_seen_at <= now()
        and prepared.has_photos
        and not prepared.photo_unavailable
        and not prepared.source_removed
        and not prepared.auction_ended
      ) as customer_visible
    from (
      select
        d.active,
        d.last_seen_at,
        d.created_at,
        d.updated_at,
        d.year,
        d.make,
        d.model,
        d.ask_price,
        d.mileage,
        upper(btrim(coalesce(d.vin, ''))) as normalized_vin,
        d.location_state,
        d.profit_score,
        coalesce(cardinality(array_remove(d.images, '')), 0) > 0 as has_photos,
        lower(btrim(coalesce(d.options #>> '{photoAudit,state}', ''))) =
          'unavailable' as photo_unavailable,
        lower(btrim(coalesce(d.options #>> '{sourceAvailability,state}', ''))) =
          'removed' as source_removed,
        d.auction_end_at is not null and d.auction_end_at <= now() as auction_ended
      from public.deals d
    ) prepared
  ),
  duplicate_vins as (
    select coalesce(sum(vin_count - 1), 0)::bigint as rows
    from (
      select count(*)::bigint as vin_count
      from core_rows c
      where c.active = true
        and c.normalized_vin ~ '^[A-HJ-NPR-Z0-9]{17}$'
      group by c.normalized_vin
      having count(*) > 1
    ) grouped
  ),
  core_aggregate as (
    select
      count(*)::bigint as total_rows,
      count(*) filter (where c.active = true)::bigint as active_rows,
      count(*) filter (where c.customer_visible)::bigint as current_visible_rows,
      count(*) filter (
        where c.customer_visible and c.created_at > now() - interval '24 hours'
      )::bigint as new_last_24h_rows,
      count(*) filter (
        where c.customer_visible and c.created_at > now() - interval '7 days'
      )::bigint as new_last_7d_rows,
      count(*) filter (
        where c.customer_visible and c.updated_at > now() - interval '24 hours'
      )::bigint as updated_last_24h_rows,
      max(c.last_seen_at) filter (where c.customer_visible) as newest_visible_at,
      count(*) filter (where c.active = true and not c.customer_visible)::bigint
        as retained_not_visible_rows,
      count(*) filter (where c.active is distinct from true)::bigint as inactive_rows,
      count(*) filter (where c.active = true and c.last_seen_at is null)::bigint
        as unobserved_active_rows,
      count(*) filter (where c.active = true and c.last_seen_at > now())::bigint
        as future_observation_active_rows,
      count(*) filter (
        where c.active = true and c.last_seen_at < now() - interval '72 hours'
      )::bigint as stale_active_rows,
      count(*) filter (where c.active = true and not c.has_photos)::bigint
        as missing_photos_active_rows,
      count(*) filter (where c.active = true and c.photo_unavailable)::bigint
        as photos_unavailable_active_rows,
      count(*) filter (where c.active = true and c.source_removed)::bigint
        as source_removed_active_rows,
      count(*) filter (where c.active = true and c.auction_ended)::bigint
        as ended_auction_active_rows,
      count(*) filter (
        where c.active = true
          and (
            c.year is null
            or nullif(btrim(c.make), '') is null
            or nullif(btrim(c.model), '') is null
          )
      )::bigint as missing_required_active_rows,
      count(*) filter (
        where c.active = true
          and (c.year < 1900 or c.year > extract(year from now())::int + 2)
      )::bigint as invalid_year_active_rows,
      count(*) filter (
        where c.active = true and (c.ask_price < 100 or c.ask_price > 500000)
      )::bigint as invalid_price_active_rows,
      count(*) filter (
        where c.active = true and coalesce(c.ask_price, 0) <= 0
      )::bigint as missing_price_active_rows,
      count(*) filter (
        where c.active = true and c.mileage is not null
          and (c.mileage < 0 or c.mileage > 500000)
      )::bigint as invalid_mileage_active_rows,
      count(*) filter (
        where c.active = true and nullif(c.normalized_vin, '') is null
      )::bigint as missing_vin_active_rows,
      count(*) filter (
        where c.active = true
          and nullif(btrim(coalesce(c.location_state, '')), '') is null
      )::bigint as missing_location_active_rows,
      count(*) filter (
        where c.active = true and c.profit_score is null
      )::bigint as missing_profit_score_active_rows
    from core_rows c
  ),
  visible_rows as materialized (
    select
      d.ask_price,
      d.sell_estimate,
      d.true_net_profit,
      upper(btrim(coalesce(d.vin, ''))) as normalized_vin,
      d.mileage,
      d.deal_verdict,
      d.lat,
      d.lng,
      d.location_city,
      d.mmr_value,
      d.profit_score,
      d.source::text as source,
      valuation."resaleEvidence" as resale_evidence,
      valuation.source as valuation_source,
      valuation.confidence,
      valuation."compCount" as comp_count,
      valuation."soldLane" as sold_lane,
      valuation."soldAnchored" as sold_anchored,
      valuation."soldCount" as sold_count,
      valuation."soldAt" as sold_at,
      gates."priceMeaningConfirmed" as price_meaning_confirmed,
      gates."titleReviewed" as title_reviewed,
      gates."conditionInspected" as condition_inspected,
      gates."costsConfirmed" as costs_confirmed,
      coalesce(d.deal_analysis #>> '{priceImplausible}', 'false') as price_implausible,
      coalesce(d.options #>> '{priceEvidence,kind}', '') as price_evidence_kind
    from public.deals d
    left join lateral jsonb_to_record(
      coalesce(d.deal_analysis -> 'valuation', '{}'::jsonb)
    ) as valuation(
      "resaleEvidence" text,
      source text,
      confidence text,
      "compCount" text,
      "soldLane" text,
      "soldAnchored" text,
      "soldCount" text,
      "soldAt" text
    ) on true
    left join lateral jsonb_to_record(
      coalesce(d.deal_analysis -> 'evidenceGates', '{}'::jsonb)
    ) as gates(
      "priceMeaningConfirmed" text,
      "titleReviewed" text,
      "conditionInspected" text,
      "costsConfirmed" text
    ) on true
    where d.active = true
      and d.last_seen_at >= now() - interval '72 hours'
      and d.last_seen_at <= now()
      and coalesce(cardinality(array_remove(d.images, '')), 0) > 0
      and coalesce(lower(btrim(d.options #>> '{photoAudit,state}')), '') <>
        'unavailable'
      and coalesce(lower(btrim(d.options #>> '{sourceAvailability,state}')), '') <>
        'removed'
      and (d.auction_end_at is null or d.auction_end_at > now())
  ),
  current_aggregate as (
    select
      count(*) filter (
        where v.ask_price > 0
          and v.sell_estimate > 0
          and v.true_net_profit is not null
      )::bigint as profit_modeled_rows,
      count(*) filter (where v.resale_evidence = 'true')::bigint
        as resale_evidence_rows,
      count(*) filter (
        where v.price_meaning_confirmed = 'true'
          and v.title_reviewed = 'true'
          and v.condition_inspected = 'true'
          and v.costs_confirmed = 'true'
      )::bigint as purchase_checks_complete_rows,
      count(*) filter (
        where v.deal_verdict = 'go'
          and v.ask_price > 0
          and v.sell_estimate > 0
          and v.true_net_profit is not null
          and v.normalized_vin ~ '^[A-HJ-NPR-Z0-9]{17}$'
          and v.mileage is not null and v.mileage >= 0
          and v.price_meaning_confirmed = 'true'
          and v.title_reviewed = 'true'
          and v.condition_inspected = 'true'
          and v.costs_confirmed = 'true'
          and v.valuation_source = 'comparables'
          and v.confidence in ('high', 'medium')
          and case
            when coalesce(v.comp_count, '') ~ '^[0-9]+$' then v.comp_count::int
            else 0
          end >= 3
          and v.sold_lane = 'clean'
          and v.sold_anchored = 'true'
          and case
            when coalesce(v.sold_count, '') ~ '^[0-9]+$' then v.sold_count::int
            else 0
          end >= 3
          and public.inventory_safe_timestamptz(nullif(v.sold_at, ''))
            between now() - interval '180 days' and now()
          and v.price_implausible <> 'true'
          and v.price_evidence_kind not in (
            'current_bid', 'reference', 'unknown', 'down_payment',
            'monthly_payment', 'finance_teaser'
          )
          and v.source not in (
            'copart', 'iaa', 'adesa', 'manheim', 'gov_auction', 'acv'
          )
      )::bigint as strict_buy_candidates,
      count(*) filter (where v.lat is not null and v.lng is not null)::bigint
        as geocoded_rows,
      count(*) filter (
        where nullif(btrim(coalesce(v.location_city, '')), '') is not null
      )::bigint as city_rows,
      count(*) filter (
        where v.ask_price >= 3000
          and v.sell_estimate > 0
          and v.true_net_profit is not null
          and v.true_net_profit < 0
      )::bigint as watch_candidate_rows,
      count(*) filter (where v.mmr_value > 0)::bigint as market_value_backed_rows,
      count(*) filter (where v.sell_estimate > 0)::bigint
        as resale_estimate_backed_rows,
      count(*) filter (
        where v.sell_estimate > 0
          and v.true_net_profit is not null
          and v.profit_score is not null
      )::bigint as deal_math_ready_rows,
      count(*) filter (where v.deal_verdict = 'go')::bigint as go_rows,
      count(*) filter (where v.deal_verdict = 'hold')::bigint as hold_rows,
      count(*) filter (where v.deal_verdict = 'pass')::bigint as pass_rows,
      count(*) filter (where v.deal_verdict = 'not_enough_data')::bigint
        as insufficient_rows
    from visible_rows v
  )
  select
    now(),
    c.total_rows,
    c.active_rows,
    c.current_visible_rows,
    c.new_last_24h_rows,
    c.new_last_7d_rows,
    c.updated_last_24h_rows,
    c.newest_visible_at,
    c.retained_not_visible_rows,
    c.inactive_rows,
    c.unobserved_active_rows,
    c.future_observation_active_rows,
    c.stale_active_rows,
    c.missing_photos_active_rows,
    c.photos_unavailable_active_rows,
    c.source_removed_active_rows,
    c.ended_auction_active_rows,
    c.missing_required_active_rows,
    c.invalid_year_active_rows,
    c.invalid_price_active_rows,
    c.missing_price_active_rows,
    c.invalid_mileage_active_rows,
    c.missing_vin_active_rows,
    duplicate_vins.rows,
    c.missing_location_active_rows,
    c.missing_profit_score_active_rows,
    current_aggregate.profit_modeled_rows,
    current_aggregate.resale_evidence_rows,
    current_aggregate.purchase_checks_complete_rows,
    current_aggregate.strict_buy_candidates,
    current_aggregate.geocoded_rows,
    current_aggregate.city_rows,
    current_aggregate.watch_candidate_rows,
    current_aggregate.market_value_backed_rows,
    current_aggregate.resale_estimate_backed_rows,
    current_aggregate.deal_math_ready_rows,
    current_aggregate.go_rows,
    current_aggregate.hold_rows,
    current_aggregate.pass_rows,
    current_aggregate.insufficient_rows
  from core_aggregate c
  cross join duplicate_vins
  cross join current_aggregate;
$$;

comment on function public.inventory_quality_rollup_v1() is
  'Service-only staged inventory audit; wide valuation JSON is read only for current visible rows.';

revoke all on function public.inventory_quality_rollup_v1()
  from public, anon, authenticated;
grant execute on function public.inventory_quality_rollup_v1()
  to service_role;

commit;
