// Bounded, source-backed location/photo repair. Never advances listing freshness.
// Dry-run by default. Remote writes require --apply --expected-project <ref> --receipt <path>.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { load } from "cheerio";
import pLimit from "p-limit";
import { politeFetch } from "../lib/scrapers/polite/polite-fetch";
import { listingLocation } from "../lib/scrapers/listing-location";
import { craigslistGalleryImages } from "../lib/scrapers/sources/index";
import { inspectListingPhotos } from "../lib/images/photo-health";
import { policyBlockFor } from "../lib/scrapers/source-compliance";
config({ path: ".env.local", quiet: true });
const arg = (key: string) => process.argv[process.argv.indexOf(key) + 1];
const apply = process.argv.includes("--apply");
const receipt = process.argv.includes("--receipt")
  ? arg("--receipt")
  : undefined;
const max = process.argv.includes("--max") ? Number(arg("--max")) : 100;
const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!Number.isInteger(max) || max < 1 || max > 2500)
  throw Error("--max must be 1–2500");
if (
  apply &&
  (!receipt ||
    new URL(projectUrl).hostname !== `${arg("--expected-project")}.supabase.co`)
)
  throw Error("Writes require --receipt and matching --expected-project");
const db = createClient(projectUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
async function main() {
  const done = new Set<string>();
  if (receipt && existsSync(receipt))
    for (const line of readFileSync(receipt, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)) {
      const r = JSON.parse(line);
      if (["updated", "unavailable"].includes(r.outcome)) done.add(r.id);
    }
  const rows: any[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("deals")
      .select(
        "id,source,source_url,vin,images,options,location_city,location_state,location_zip,lat,lng,updated_at",
      )
      .eq("active", true)
      .in("source", [
        "craigslist",
        "craigslist_dealer",
        "independent_dealer",
        "cars_com",
        "cargurus",
        "truecar",
        "offerup",
        "copart",
        "gov_auction",
      ])
      .order("id")
      .range(from, from + 499);
    if (error) throw Error(error.message);
    rows.push(
      ...(data || []).filter(
        (r) =>
          !done.has(r.id) &&
          (r.lat == null || r.lng == null || !r.images?.length),
      ),
    );
    if (!data || data.length < 500) break;
  }
  const counts = {
    total: Math.min(rows.length, max),
    processed: 0,
    locations: 0,
    photos: 0,
    removed: 0,
    unavailable: 0,
    conflicts: 0,
  };
  const limit = pLimit(3);
  await Promise.all(
    rows.slice(0, max).map((row) =>
      limit(async () => {
        const sourceUrl = row.source_url?.startsWith("//")
          ? `https:${row.source_url}`
          : row.source_url;
        const blocked = policyBlockFor(sourceUrl);
        const response = blocked
          ? {
              url: sourceUrl,
              status: 0,
              body: "",
              ok: false,
              challenge: false,
              skipped: "source_policy",
            }
          : await politeFetch(sourceUrl, {
              maxRetries: 0,
              freshForMs: 0,
              timeoutMs: 10000,
            });
        const checkedAt = new Date().toISOString();
        let outcome = "unavailable";
        const patch: Record<string, any> = {};
        const craigslist =
          ["craigslist", "craigslist_dealer"].includes(row.source) &&
          /(^|\.)craigslist\.org$/i.test(new URL(sourceUrl).hostname);
        if (
          response.status === 410 &&
          craigslist &&
          !response.challenge &&
          !response.skipped
        ) {
          patch.active = false;
          patch.options = {
            ...row.options,
            sourceAvailability: {
              state: "removed",
              status: 410,
              checkedAt,
              sourceUrl,
            },
          };
        } else if (response.ok && !response.challenge && !response.skipped) {
          if (row.lat == null || row.lng == null)
            Object.assign(
              patch,
              listingLocation(
                response.body,
                response.url || sourceUrl,
                row.vin,
              ),
            );
          if (!row.images?.length && craigslist) {
            const $ = load(response.body);
            const photos = craigslistGalleryImages(
              $(
                '.gallery img, .slide img, img[src*="images.craigslist"], a.thumb',
              )
                .map((_, e) => $(e).attr("href") || $(e).attr("src"))
                .get(),
            );
            if (photos.length) {
              const audit = await inspectListingPhotos(photos, {
                maxPhotos: 3,
              });
              if (audit.state === "available") {
                patch.images = audit.images;
                patch.options = { ...row.options, photoAudit: audit };
              }
            }
          }
        }
        if (Object.keys(patch).length) {
          // Retain the exact source and coordinate evidence without overriding other captured options.
          patch.options = {
            ...(patch.options || row.options),
            locationEvidence:
              patch.location_city || patch.lat != null
                ? {
                    checkedAt,
                    sourceUrl: response.url || sourceUrl,
                    method: "source_detail",
                  }
                : row.options?.locationEvidence,
          };
          if (!apply) outcome = "would_update";
          else {
            if (receipt)
              appendFileSync(
                receipt,
                JSON.stringify({
                  at: checkedAt,
                  id: row.id,
                  before: row,
                  patch,
                  outcome: "prepared",
                }) + "\n",
              );
            const { data, error } = await db
              .from("deals")
              .update(patch)
              .eq("id", row.id)
              .eq("active", true)
              .eq("source_url", row.source_url)
              .eq("updated_at", row.updated_at)
              .select("id");
            if (error) throw Error(error.message);
            outcome = data?.length ? "updated" : "conflict";
          }
          if (outcome === "updated" || outcome === "would_update") {
            if (patch.lat != null && patch.lng != null) counts.locations++;
            if (patch.images) counts.photos++;
            if (patch.active === false) counts.removed++;
          }
          if (outcome === "conflict") counts.conflicts++;
        } else counts.unavailable++;
        if (receipt)
          appendFileSync(
            receipt,
            JSON.stringify({
              at: checkedAt,
              id: row.id,
              status: response.status,
              skipped: response.skipped,
              challenge: response.challenge,
              outcome,
              location: {
                city: patch.location_city,
                state: patch.location_state,
                zip: patch.location_zip,
              },
            }) + "\n",
          );
        counts.processed++;
        if (counts.processed % 25 === 0 || counts.processed === counts.total)
          console.log(JSON.stringify({ apply, ...counts }));
      }),
    ),
  );
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
