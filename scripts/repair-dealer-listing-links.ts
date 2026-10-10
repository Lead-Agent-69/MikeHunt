import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { load } from "cheerio";
import { createPoliteHtmlFetcher } from "../lib/scrapers/polite-html";
import { genericExtract } from "../lib/scrapers/generic-extractor";
import { dealerListingUrl } from "../lib/scrapers/dealer-listing-url";
import { matchingDealerListing } from "../lib/scrapers/dealer-link-match";
import type { Deal } from "../types";

async function main() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration required");
  const apply = process.argv.includes("--apply");
  const maxFetches = Math.min(
    100,
    Math.max(1, Number(process.env.LINK_REPAIR_MAX_FETCHES) || 40),
  );
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const base = "https://www.alanjay.com";
  const { data, error } = await db
    .from("deals")
    .select("id,year,make,model,vin,ask_price,mileage,source_url,updated_at")
    .eq("active", true)
    .eq("source", "independent_dealer")
    .in("source_url", [base, `${base}/`])
    .order("id")
    .limit(300);
  if (error) throw error;
  if (!data?.length) {
    console.log(
      JSON.stringify({
        mode: apply ? "apply" : "dry-run",
        scanned: 0,
        updated: 0,
      }),
    );
    return;
  }
  const get = createPoliteHtmlFetcher();
  const xml = load(await get(`${base}/inventory-sitemap`), { xmlMode: true });
  const urls = Array.from(
    new Set(
      xml("loc")
        .map((_, el) => xml(el).text().trim())
        .get(),
    ),
  ).filter((href) => dealerListingUrl(href, base, "/used"));
  const fetched = new Map<string, Partial<Deal>[]>();
  let updated = 0;
  let verified = 0;
  let deferred = 0;
  for (const row of data) {
    const slug = [row.year, row.make, row.model]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-");
    const candidates = urls.filter((href) =>
      new URL(href).pathname
        .toLowerCase()
        .startsWith(`/vehicle-info/used-${slug}-`),
    );
    if (!candidates.length) continue;
    // Never choose a match from only part of a vehicle group.
    const missing = candidates.filter((href) => !fetched.has(href));
    if (fetched.size + missing.length > maxFetches) {
      deferred++;
      continue;
    }
    for (const href of missing) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const vehicles = genericExtract(
        await get(href),
        "independent_dealer",
      ).filter(
        (vehicle) =>
          vehicle.source_url &&
          dealerListingUrl(vehicle.source_url, base, "/used") === href,
      );
      fetched.set(href, vehicles);
    }
    const match = matchingDealerListing(
      row,
      candidates.flatMap((href) => fetched.get(href) || []),
    );
    if (!match?.source_url) continue;
    verified++;
    console.log(
      JSON.stringify({
        id: row.id,
        from: row.source_url,
        to: match.source_url,
      }),
    );
    if (!apply) continue;
    const result = await db
      .from("deals")
      .update({ source_url: match.source_url })
      .eq("id", row.id)
      .eq("active", true)
      .eq("source_url", row.source_url)
      .eq("updated_at", row.updated_at)
      .select("id,source_url");
    if (result.error) throw result.error;
    updated +=
      result.data?.filter((record) => record.source_url === match.source_url)
        .length || 0;
  }
  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        scanned: data.length,
        fetched: fetched.size,
        verified,
        updated,
        deferred,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
