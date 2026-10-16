// Source-backed repair of Craigslist galleries and price meaning. Dry-run unless --apply.
// No listing freshness changes: photo maintenance does not establish availability.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { appendFileSync } from "node:fs";
import { enrichCraigslistDetail } from "../lib/scrapers/sources/index";
config({ path: ".env.local", quiet: true });
const arg = (key: string) => {
  const i = process.argv.indexOf(key);
  return i < 0 ? undefined : process.argv[i + 1];
};
const apply = process.argv.includes("--apply");
const max = Number(arg("--max") || 100);
const receipt = arg("--receipt");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const host = new URL(url).hostname;
if (
  apply &&
  !["localhost", "127.0.0.1"].includes(host) &&
  host !== `${arg("--expected-project")}.supabase.co`
)
  throw new Error("Remote writes require matching --expected-project");
if (!Number.isInteger(max) || max < 1 || max > 2000)
  throw new Error("--max must be 1–2000");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
async function main() {
  const rows: any[] = [];
  for (let from = 0; from < max; from += 500) {
    const { data, error } = await db
      .from("deals")
      .select("id,source_url,source_deal_id,vin,images,options,updated_at")
      .eq("active", true)
      .in("source", ["craigslist", "craigslist_dealer"])
      .order("id")
      .range(from, Math.min(from + 499, max - 1));
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  let processed = 0,
    photos = 0,
    prices = 0,
    unavailable = 0,
    changed = 0,
    conflicts = 0;
  for (const row of rows) {
    if (processed) await new Promise((resolve) => setTimeout(resolve, 500));
    processed++;
    if (
      row.images?.length &&
      Date.parse(row.options?.priceEvidence?.checkedAt || "") >
        Date.now() - 86400000
    )
      continue;
    try {
      const source = new URL(row.source_url);
      if (
        source.protocol !== "https:" ||
        !/(^|\.)craigslist\.org$/i.test(source.hostname)
      ) {
        unavailable++;
        continue;
      }
      const extra = await enrichCraigslistDetail(source.toString());
      if (
        row.vin &&
        extra.vin &&
        row.vin.toUpperCase() !== extra.vin.toUpperCase()
      ) {
        conflicts++;
        continue;
      }
      const patch: Record<string, unknown> = {};
      const evidence = extra.options?.priceEvidence;
      if (extra.images?.length) patch.images = extra.images;
      if (evidence && evidence.kind !== "unknown")
        patch.options = { ...(row.options || {}), priceEvidence: evidence };
      if (!row.vin && extra.vin) patch.vin = extra.vin;
      if (!Object.keys(patch).length) {
        unavailable++;
      } else if (!apply) {
        changed++;
        if (patch.images) photos++;
        if (patch.options) prices++;
      } else {
        if (receipt)
          appendFileSync(
            receipt,
            JSON.stringify({
              at: new Date().toISOString(),
              before: row,
              patch,
            }) + "\n",
          );
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          result = await db
            .from("deals")
            .update(patch)
            .eq("id", row.id)
            .eq("active", true)
            .eq("source_url", row.source_url)
            .eq("updated_at", row.updated_at)
            .select("id");
          if (result.error?.code !== "57014" || attempt === 2) break;
          await new Promise((resolve) =>
            setTimeout(resolve, 1500 * (attempt + 1)),
          );
        }
        const { data, error } = result!;
        if (error) throw new Error(error.message);
        if (data?.length) {
          changed++;
          if (patch.images) photos++;
          if (patch.options) prices++;
        } else conflicts++;
      }
    } catch (error) {
      // A database error must stop the repair; source access failures return {} from the fetcher.
      throw new Error(
        `Repair stopped after ${processed} listings: ${(error as Error).message}`,
      );
    }
    if (processed % 20 === 0 || processed === rows.length)
      console.log(
        JSON.stringify({
          host,
          apply,
          processed,
          total: rows.length,
          changed,
          photos,
          prices,
          unavailable,
          conflicts,
        }),
      );
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
