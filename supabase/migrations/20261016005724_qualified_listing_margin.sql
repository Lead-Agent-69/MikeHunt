begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';

-- Only a recorded cash asking price plus independent valuation evidence can form this gap.
alter table public.deals add column deal_margin numeric generated always as (
  case when ask_price > 0 and ask_price < 2000000 and sell_estimate > 0 and sell_estimate < 2000000
    and options->'priceEvidence'->>'kind' = 'asking'
    and case when jsonb_typeof(options->'priceEvidence'->'askingPrice') = 'number'
      then (options->'priceEvidence'->>'askingPrice')::numeric = ask_price
      else false end
    and deal_analysis->'valuation'->'resaleEvidence' = 'true'::jsonb
    and deal_analysis->'valuation'->>'source' in ('comparables', 'third_party')
    and coalesce(deal_analysis->'priceImplausible', 'false'::jsonb) <> 'true'::jsonb
  then round((sell_estimate - ask_price)::numeric, 2)
  else null end
) stored;

create index deals_active_margin_idx on public.deals (deal_margin desc nulls last, id)
  where active = true and deal_margin is not null;
grant select (deal_margin) on public.deals to service_role;
comment on column public.deals.deal_margin is 'Qualified estimate minus recorded cash asking price, before repair, fees, transport, tax or holding costs. Not net profit or a guaranteed resale value.';
commit;
