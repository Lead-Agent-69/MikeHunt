-- Run after 20261023112321_inventory_quality_rollup_v1.sql on a disposable/local database.
-- Every fixture is rolled back; the assertions compare deltas so existing local rows are harmless.
begin;
set local statement_timeout = '15s';

do $$
declare
  marker text := 'inventory-quality-' || gen_random_uuid();
  before_row jsonb;
  after_row jsonb;
  before_source_visible bigint;
  before_source_stored bigint;
  after_source_visible bigint;
  after_source_stored bigint;
  strict_analysis jsonb := jsonb_build_object(
    'evidenceGates', jsonb_build_object(
      'priceMeaningConfirmed', true,
      'titleReviewed', true,
      'conditionInspected', true,
      'costsConfirmed', true
    ),
    'valuation', jsonb_build_object(
      'source', 'comparables',
      'confidence', 'high',
      'compCount', 5,
      'resaleEvidence', true,
      'soldLane', 'clean',
      'soldCount', 3,
      'soldAnchored', true,
      'soldAt', now()
    )
  );
begin
  if has_function_privilege('anon', 'public.inventory_quality_rollup_v1()', 'execute')
    or has_function_privilege('authenticated', 'public.inventory_quality_rollup_v1()', 'execute') then
    raise exception 'Inventory quality audit leaked to a browser role';
  end if;
  if not has_function_privilege('service_role', 'public.inventory_quality_rollup_v1()', 'execute') then
    raise exception 'Worker cannot execute the inventory quality audit';
  end if;
  if public.inventory_safe_timestamptz('not-a-date') is not null then
    raise exception 'Malformed evidence date was accepted';
  end if;

  select to_jsonb(q) into before_row from public.inventory_quality_rollup_v1() q;
  select coalesce(sum(active_rows), 0), coalesce(sum(stored_active_rows), 0)
    into before_source_visible, before_source_stored
  from public.scrape_health_inventory_rollup_v2(array['independent_dealer']);

  insert into public.deals(
    source, source_deal_id, source_url, title, year, make, model, condition,
    ask_price, sell_estimate, true_net_profit, profit_score, deal_verdict,
    vin, mileage, images, location_state, active, first_seen_at, last_seen_at,
    auction_end_at, availability_status, options, deal_analysis
  ) values
    ('independent_dealer', marker || '-current', 'https://example.invalid/current',
      'Current online vehicle', 2021, 'Test', 'Current', 'clean_title',
      12000, null, null, 50, null, null, 50000,
      array['https://example.invalid/current.jpg'], 'MO', true, now(), now(),
      null, 'online_only', '{}'::jsonb, null),
    ('independent_dealer', marker || '-strict', 'https://example.invalid/strict',
      'Decision-ready vehicle', 2021, 'Test', 'Strict', 'clean_title',
      12000, 18000, 4000, 90, 'go', '1HGCM82633A004352', 50000,
      array['https://example.invalid/strict.jpg'], 'MO', true, now(), now(),
      null, 'on_lot', '{"priceEvidence":{"kind":"asking"}}'::jsonb, strict_analysis),
    ('independent_dealer', marker || '-stale', 'https://example.invalid/stale',
      'Stale vehicle', 2021, 'Test', 'Stale', 'clean_title',
      12000, null, null, null, null, null, 50000,
      array['https://example.invalid/stale.jpg'], 'MO', true, now() - interval '4 days', now() - interval '4 days',
      null, 'on_lot', '{}'::jsonb, null),
    ('independent_dealer', marker || '-future', 'https://example.invalid/future',
      'Future vehicle', 2021, 'Test', 'Future', 'clean_title',
      12000, null, null, null, null, null, 50000,
      array['https://example.invalid/future.jpg'], 'MO', true, now(), now() + interval '1 hour',
      null, 'on_lot', '{}'::jsonb, null),
    ('independent_dealer', marker || '-photo', 'https://example.invalid/photo',
      'Unavailable photo vehicle', 2021, 'Test', 'Photo', 'clean_title',
      12000, null, null, null, null, null, 50000,
      array['https://example.invalid/photo.jpg'], 'MO', true, now(), now(),
      null, 'on_lot', '{"photoAudit":{"state":"unavailable"}}'::jsonb, null),
    ('independent_dealer', marker || '-removed', 'https://example.invalid/removed',
      'Removed source vehicle', 2021, 'Test', 'Removed', 'clean_title',
      12000, null, null, null, null, null, 50000,
      array['https://example.invalid/removed.jpg'], 'MO', true, now(), now(),
      null, 'on_lot', '{"sourceAvailability":{"state":"removed"}}'::jsonb, null),
    ('copart', marker || '-ended', 'https://example.invalid/ended',
      'Ended auction vehicle', 2021, 'Test', 'Ended', 'clean_title',
      12000, null, null, null, null, null, 50000,
      array['https://example.invalid/ended.jpg'], 'MO', true, now(), now(),
      now() - interval '1 minute', 'on_lot', '{}'::jsonb, null),
    ('independent_dealer', marker || '-missing-photo', 'https://example.invalid/missing-photo',
      'No photo vehicle', 2021, 'Test', 'NoPhoto', 'clean_title',
      12000, null, null, null, null, null, 50000,
      '{}'::text[], 'MO', true, now(), now(), null, 'on_lot', '{}'::jsonb, null),
    ('independent_dealer', marker || '-inactive', 'https://example.invalid/inactive',
      'Inactive vehicle', 2021, 'Test', 'Inactive', 'clean_title',
      12000, null, null, null, null, null, 50000,
      array['https://example.invalid/inactive.jpg'], 'MO', false, now(), now(),
      null, 'on_lot', '{}'::jsonb, null);

  select to_jsonb(q) into after_row from public.inventory_quality_rollup_v1() q;
  select coalesce(sum(active_rows), 0), coalesce(sum(stored_active_rows), 0)
    into after_source_visible, after_source_stored
  from public.scrape_health_inventory_rollup_v2(array['independent_dealer']);

  if (after_row->>'total_rows')::bigint <> (before_row->>'total_rows')::bigint + 9
    or (after_row->>'active_rows')::bigint <> (before_row->>'active_rows')::bigint + 8
    or (after_row->>'inactive_rows')::bigint <> (before_row->>'inactive_rows')::bigint + 1 then
    raise exception 'Stored/active inventory accounting is incorrect';
  end if;
  if (after_row->>'current_visible_rows')::bigint <> (before_row->>'current_visible_rows')::bigint + 2
    or (after_row->>'retained_not_visible_rows')::bigint <> (before_row->>'retained_not_visible_rows')::bigint + 6 then
    raise exception 'Buyer-visible inventory boundary is incorrect';
  end if;
  if (after_row->>'new_last_24h_rows')::bigint <> (before_row->>'new_last_24h_rows')::bigint + 2
    or (after_row->>'new_last_7d_rows')::bigint <> (before_row->>'new_last_7d_rows')::bigint + 2
    or (after_row->>'updated_last_24h_rows')::bigint <> (before_row->>'updated_last_24h_rows')::bigint + 2 then
    raise exception 'Recent harvest accounting is incorrect';
  end if;
  if (after_row->>'stale_active_rows')::bigint <> (before_row->>'stale_active_rows')::bigint + 1
    or (after_row->>'future_observation_active_rows')::bigint <> (before_row->>'future_observation_active_rows')::bigint + 1
    or (after_row->>'missing_photos_active_rows')::bigint <> (before_row->>'missing_photos_active_rows')::bigint + 1
    or (after_row->>'photos_unavailable_active_rows')::bigint <> (before_row->>'photos_unavailable_active_rows')::bigint + 1
    or (after_row->>'source_removed_active_rows')::bigint <> (before_row->>'source_removed_active_rows')::bigint + 1
    or (after_row->>'ended_auction_active_rows')::bigint <> (before_row->>'ended_auction_active_rows')::bigint + 1 then
    raise exception 'Inventory exclusion accounting is incorrect';
  end if;
  if (after_row->>'current_profit_modeled_rows')::bigint <> (before_row->>'current_profit_modeled_rows')::bigint + 1
    or (after_row->>'current_resale_evidence_rows')::bigint <> (before_row->>'current_resale_evidence_rows')::bigint + 1
    or (after_row->>'current_purchase_checks_complete_rows')::bigint <> (before_row->>'current_purchase_checks_complete_rows')::bigint + 1
    or (after_row->>'current_strict_buy_candidates')::bigint <> (before_row->>'current_strict_buy_candidates')::bigint + 1 then
    raise exception 'Profitability evidence accounting is incorrect';
  end if;
  if after_source_visible <> before_source_visible + 2
    or after_source_stored <> before_source_stored + 7 then
    raise exception 'Source rollup is not aligned to buyer-visible inventory';
  end if;
end
$$;

rollback;
