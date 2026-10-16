import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Explicit synthetic inventory for freshness-aware E2E tests. Never target hosted data.
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const configured = env
  .match(/^NEXT_PUBLIC_SUPABASE_URL\s*=\s*([^\r\n]+)/m)?.[1]
  .trim()
  .replace(/^['"]|['"]$/g, "");
if (configured !== "http://127.0.0.1:54321") {
  throw new Error("Local QA seed requires the exact local Supabase origin.");
}
function docker(args, input) {
  return execFileSync("docker", args, {
    encoding: "utf8",
    input,
    timeout: 30_000,
  });
}
if (process.env.DOCKER_HOST || process.env.DOCKER_CONTEXT) {
  throw new Error("Remove Docker endpoint overrides before local QA seeding.");
}
const context = docker(["context", "show"]).trim();
if (!["default", "desktop-linux"].includes(context)) {
  throw new Error("Only the local Docker Desktop context is supported.");
}
const endpoint = JSON.parse(docker(["context", "inspect", context]))[0]
  .Endpoints.docker.Host;
if (!endpoint.startsWith("npipe://")) {
  throw new Error(
    "QA seeding requires a local Windows named-pipe Docker endpoint.",
  );
}
const container = "supabase_db_MikeHunt";
const labels = JSON.parse(docker(["inspect", container]))[0].Config.Labels;
if (labels["com.supabase.cli.project"] !== "MikeHunt") {
  throw new Error("Local Supabase project identity does not match.");
}

const sql = `
BEGIN;
SET LOCAL statement_timeout = '10s';
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.deals
    WHERE source_deal_id LIKE 'local-qa-v1-%'
      AND options->>'qa_fixture' IS DISTINCT FROM 'local-qa-v1') THEN
    RAISE EXCEPTION 'QA fixture identity collides with existing inventory';
  END IF;
END $$;
WITH donors AS (
  SELECT *, row_number() OVER (ORDER BY id) AS fixture_number
  FROM (SELECT * FROM public.deals
    WHERE source = 'independent_dealer' AND cardinality(images) > 0
      AND source_deal_id NOT LIKE 'local-qa-v1-%'
    ORDER BY id LIMIT 24) originals
)
INSERT INTO public.deals
  (source, source_deal_id, source_url, title, year, make, model, condition,
   ask_price, mileage, images, location_state, location_city, lat, lng,
   active, options, first_seen_at, last_seen_at)
SELECT source, 'local-qa-v1-' || fixture_number,
  'https://example.test/local-qa/' || fixture_number,
  '[Local QA fixture] ' || year || ' ' || make || ' ' || model,
  year, make, model, condition, greatest(ask_price, 1000), mileage, images,
  'MO', 'Saint Louis', 38.627 + fixture_number * 0.001, -90.199,
  true, jsonb_build_object('qa_fixture', 'local-qa-v1'), now(), now()
FROM donors
ON CONFLICT (source, source_deal_id) DO UPDATE
SET last_seen_at = now(), active = true
WHERE deals.options->>'qa_fixture' = 'local-qa-v1';
WITH donor AS (
  SELECT images FROM public.deals WHERE cardinality(images) > 0
  ORDER BY id LIMIT 1
)
INSERT INTO public.deals
  (source, source_deal_id, source_url, title, year, make, model, condition,
   ask_price, sell_estimate, mileage, images, location_state, location_city,
   lat, lng, active, options, deal_analysis, first_seen_at, last_seen_at)
SELECT 'independent_dealer', 'local-qa-v1-radius-' || sample.code,
  'https://example.test/local-qa/radius/' || sample.code,
  '[Local QA fixture] WalkthroughRadius ' || sample.city,
  2021, 'Ford', 'Escape', 'clean_title', sample.ask, 16000, 45000, donor.images,
  sample.state, sample.city, sample.lat, sample.lng, true,
  jsonb_build_object('qa_fixture','local-qa-v1','priceEvidence',
    jsonb_build_object('kind','asking','askingPrice',sample.ask)),
  '{"valuation":{"source":"comparables","compCount":3,"compKind":"ask","compScope":"state","cleanComp":16000,"mileageMult":1,"titleMult":1,"resaleEvidence":true}}'::jsonb,
  now(), now()
FROM donor CROSS JOIN (VALUES
  ('mo','St. Louis','MO',38.63,-90.20,12000),
  ('il','Belleville','IL',38.52,-89.98,10000),
  ('far','Chicago','IL',41.88,-87.63,9000)
) sample(code,city,state,lat,lng,ask)
ON CONFLICT (source, source_deal_id) DO UPDATE
SET last_seen_at=now(), active=true, ask_price=excluded.ask_price,
    sell_estimate=excluded.sell_estimate, options=excluded.options,
    deal_analysis=excluded.deal_analysis
WHERE deals.options->>'qa_fixture'='local-qa-v1';
INSERT INTO public.deals
  (source,source_deal_id,source_url,title,year,make,model,condition,ask_price,
   images,location_state,location_city,lat,lng,active,options,first_seen_at,last_seen_at,auction_end_at)
SELECT 'copart','local-qa-v1-current-bid','https://example.test/local-qa/current-bid',
  '[Local QA fixture] 2021 Ford Escape auction',2021,'Ford','Escape','repairable',7500,
  images,'MO','St. Louis',38.63,-90.20,true,
  jsonb_build_object('qa_fixture','local-qa-v1','priceEvidence',
    jsonb_build_object('kind','current_bid','currentBid',7500,'listedAmount',7500)),
  now(),now(),now()+interval '2 days'
FROM public.deals WHERE cardinality(images)>0 ORDER BY id LIMIT 1
ON CONFLICT (source,source_deal_id) DO UPDATE
SET last_seen_at=now(), active=true,auction_end_at=excluded.auction_end_at
WHERE deals.options->>'qa_fixture'='local-qa-v1';
SELECT count(*) AS synthetic_local_qa_vehicles FROM public.deals
WHERE options->>'qa_fixture' = 'local-qa-v1';
COMMIT;
`;
process.stdout.write(
  docker(
    [
      "exec",
      "-i",
      container,
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    sql,
  ),
);
