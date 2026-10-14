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
