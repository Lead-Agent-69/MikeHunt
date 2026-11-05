-- Server-only, non-materialized projection. Keep the original columns so shared
-- inventory predicates retain their exact PostgREST/SQL semantics and pushdown.
-- Expanding each large JSON root once avoids repeated TOAST reads per alias.
begin;

create view public.market_candidate_projection
with (security_invoker = true)
as
select
  d.*,
  o."fuelType" as reported_fuel,
  o.transmission as reported_transmission,
  o.drivetrain as reported_drivetrain,
  o."priceEvidence" as price_evidence,
  o."sellerType" as seller_type,
  o."listingTitle" as listing_title,
  o.description as listing_description,
  o.price_is_acv_estimate as reference_only,
  o."titleSource" as title_source,
  o."photoAudit" ->> 'state' as photo_state,
  o."photoAudit" -> 'placeholderUrls' as placeholder_urls,
  a.valuation,
  a."acquisitionPriceMissing" as acquisition_price_missing,
  a."priceImplausible" as price_implausible,
  a.roi as analysis_roi
from public.deals as d
left join lateral jsonb_to_record(
  case when jsonb_typeof(d.options) = 'object' then d.options else '{}'::jsonb end
) as o(
  "fuelType" text,
  transmission text,
  drivetrain text,
  "priceEvidence" jsonb,
  "sellerType" text,
  "listingTitle" text,
  description text,
  price_is_acv_estimate text,
  "titleSource" text,
  "photoAudit" jsonb
) on true
left join lateral jsonb_to_record(
  case when jsonb_typeof(d.deal_analysis) = 'object' then d.deal_analysis else '{}'::jsonb end
) as a(
  valuation jsonb,
  "acquisitionPriceMissing" jsonb,
  "priceImplausible" jsonb,
  roi jsonb
) on true;

-- Raw options, analysis and economics remain server-only. Invoker security is
-- defense in depth: it does not grant access to any underlying deals column or row.
revoke all on public.market_candidate_projection from public, anon, authenticated, service_role;
grant select on public.market_candidate_projection to service_role;

comment on view public.market_candidate_projection is
  'Server-only invoker projection for Market; expands options and deal_analysis once per row. No stored payload.';

commit;
