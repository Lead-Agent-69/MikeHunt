-- Run only on a disposable/local database. Everything is rolled back.
begin;

do $$
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'market_candidate_projection'
      and c.relkind = 'v' and c.reloptions @> array['security_invoker=true']
  ) then raise exception 'Expected a non-materialized invoker view'; end if;
  if has_table_privilege('anon', 'public.market_candidate_projection', 'select')
     or has_table_privilege('authenticated', 'public.market_candidate_projection', 'select')
     or not has_table_privilege('service_role', 'public.market_candidate_projection', 'select')
     or has_table_privilege('service_role', 'public.market_candidate_projection', 'insert')
     or has_table_privilege('service_role', 'public.market_candidate_projection', 'update')
  then raise exception 'Projection grants are broader than server SELECT'; end if;
end $$;

-- Valid JSON with malformed containers/field types must keep the original
-- -> / ->> semantics. In particular JSON strings must not become booleans/numbers.
insert into public.deals (
  id, active, source, source_deal_id, source_url, title, make, model, year,
  ask_price, last_seen_at, first_seen_at, created_at, updated_at, options, deal_analysis
)
select
  ('10000000-0000-4000-8000-' || lpad(ordinality::text,12,'0'))::uuid,
  true, 'independent_dealer', 'projection-guard-' || ordinality,
  'https://dealer.test/guard/' || ordinality, '2020 Ford Ranger', 'Ford', 'Ranger', 2020,
  12000, now(), now(), now(), now(), value, value
from unnest(array[
  null::jsonb, 'null'::jsonb, '42'::jsonb, 'true'::jsonb, '"malformed container"'::jsonb,
  '[]'::jsonb, '[{"description":"not a root field"}]'::jsonb, '{}'::jsonb,
  '{"description":null,"priceEvidence":null,"valuation":null,"roi":null}'::jsonb,
  '{"fuelType":{},"transmission":false,"drivetrain":[],"sellerType":42,"listingTitle":{},"description":{"cash":12000},"price_is_acv_estimate":{},"titleSource":[],"photoAudit":{"state":true,"placeholderUrls":[1,false,"https://dealer.test/logo.png"]},"priceEvidence":[],"valuation":[],"roi":"20","acquisitionPriceMissing":"true","priceImplausible":"false"}'::jsonb,
  '{"roi":20,"acquisitionPriceMissing":true,"priceImplausible":false,"priceEvidence":{"kind":"asking","askingPrice":12000}}'::jsonb
]) with ordinality as variants(value, ordinality);

do $$
declare mismatches integer; bad text := '{"unterminated":'; rejected boolean := false;
begin
  select count(*) into mismatches
  from public.deals d join public.market_candidate_projection v using(id)
  where d.id::text like '10000000-%' and
    jsonb_build_array(
      d.options->>'fuelType', d.options->>'transmission', d.options->>'drivetrain',
      d.options->'priceEvidence', d.options->>'sellerType', d.options->>'listingTitle',
      d.options->>'description', d.options->>'price_is_acv_estimate', d.options->>'titleSource',
      d.options->'photoAudit'->>'state', d.options->'photoAudit'->'placeholderUrls',
      d.deal_analysis->'valuation', d.deal_analysis->'acquisitionPriceMissing',
      d.deal_analysis->'priceImplausible', d.deal_analysis->'roi'
    ) is distinct from jsonb_build_array(
      v.reported_fuel, v.reported_transmission, v.reported_drivetrain,
      v.price_evidence, v.seller_type, v.listing_title, v.listing_description,
      v.reference_only, v.title_source, v.photo_state, v.placeholder_urls,
      v.valuation, v.acquisition_price_missing, v.price_implausible, v.analysis_roi
    );
  if mismatches <> 0 then raise exception 'Malformed-container projection changed % rows', mismatches; end if;
  begin perform bad::jsonb;
  exception when invalid_text_representation then rejected := true;
  end;
  if not rejected then raise exception 'Invalid JSON syntax was accepted'; end if;
end $$;

create role market_projection_reader nologin;
grant usage on schema public to market_projection_reader;
grant select on public.deals, public.market_candidate_projection to market_projection_reader;
create policy market_projection_test_owner on public.deals as restrictive
for select to market_projection_reader
using (dealer_id::text = current_setting('market_projection.owner'));
set local market_projection.owner = '00000000-0000-4000-8000-000000009001';
set local role market_projection_reader;
do $$
declare underlying integer; projected integer;
begin
  select count(*) into underlying from public.deals;
  select count(*) into projected from public.market_candidate_projection;
  if underlying = 0 or projected <> underlying then raise exception 'Invoker RLS row parity failed'; end if;
  if exists(select 1 from public.market_candidate_projection where not active or dealer_id::text <> current_setting('market_projection.owner'))
  then raise exception 'Projection bypassed active/owner policy'; end if;
end $$;
reset role;

-- A view grant must not manufacture permission to read a private base column.
revoke all on public.deals from market_projection_reader;
grant select(id) on public.deals to market_projection_reader;
set local role market_projection_reader;
do $$
begin
  begin
    perform price_evidence from public.market_candidate_projection limit 1;
    raise exception 'Invoker view bypassed base-column privileges';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
