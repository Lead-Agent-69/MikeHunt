// Recover native links and verified vehicle photos by exact VIN. Never infer a physical location.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { appendFileSync } from "node:fs";
import { inspectListingPhotos } from "../lib/images/photo-health";
import { parseCarvanaVehicles } from "../lib/scrapers/sources/carvana";
config({ path: ".env.local", quiet: true });
const arg = (name: string) => process.argv[process.argv.indexOf(name) + 1];
const apply = process.argv.includes("--apply");
const maxPages = process.argv.includes("--max-pages")
  ? Number(arg("--max-pages"))
  : 25;
const receipt = process.argv.includes("--receipt")
  ? arg("--receipt")
  : undefined;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 412)
  throw Error("--max-pages must be 1–412 (source pagination limit)");
if (
  apply &&
  (!receipt ||
    new URL(url).hostname !== `${arg("--expected-project")}.supabase.co`)
)
  throw Error("Writes require --receipt and matching --expected-project");
const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
async function main() {
  const byVin = new Map<string, any>();
  for (let from = 0; ; from += 500) {
    const { data, error } = await db
      .from("deals")
      .select("id,vin,source_url,images,ask_price,options,updated_at")
      .eq("source", "carvana")
      .eq("active", true)
      .order("id")
      .range(from, from + 499);
    if (error) throw Error(error.message);
    for (const row of data || [])
      if (row.vin) byVin.set(row.vin.toUpperCase(), row);
    if (!data || data.length < 500) break;
  }
  const seen = new Set<string>();
  const counts = {
    pages: 0,
    vehicles: 0,
    matched: 0,
    photos: 0,
    links: 0,
    conflicts: 0,
    unavailablePhotos: 0,
  };
  for (let page = 1; page <= maxPages; page++) {
    if (page > 1) await new Promise((r) => setTimeout(r, 1200));
    const res = await fetch(
      "https://apik.carvana.io/merch/search/api/v2/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "MikeHuntPro/1.0 (vehicle inventory evidence)",
          Origin: "https://www.carvana.com",
          Accept: "application/json",
        },
        body: JSON.stringify({
          pagination: { page, pageSize: 24 },
          filters: {},
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) {
      console.log(
        JSON.stringify({ stoppedAtPage: page, status: res.status, ...counts }),
      );
      break;
    }
    const body: any = await res.json();
    const vehicles = parseCarvanaVehicles(body);
    if (!vehicles.length) break;
    counts.pages++;
    counts.vehicles += vehicles.length;
    for (const vehicle of vehicles) {
      const vin = vehicle.vin!.toUpperCase();
      const row = byVin.get(vin);
      if (!row || seen.has(vin)) continue;
      seen.add(vin);
      counts.matched++;
      const patch: Record<string, any> = {};
      if (row.source_url !== vehicle.source_url)
        patch.source_url = vehicle.source_url;
      const realPhotos = (vehicle.images || []).filter(
        (image) => !image.includes("/stockimages/"),
      );
      if (
        realPhotos.length &&
        !row.images?.some((image: string) => realPhotos.includes(image))
      ) {
        const audit = await inspectListingPhotos(realPhotos, { maxPhotos: 3 });
        if (audit.state === "available") {
          patch.images = [
            ...audit.images,
            ...(row.images || []).filter(
              (image: string) => !audit.images.includes(image),
            ),
          ].slice(0, 12);
          patch.options = { ...row.options, photoAudit: audit };
        } else counts.unavailablePhotos++;
      }
      // Do not change stored pricing/economics during photo maintenance. Evidence can qualify the
      // existing price only when the freshly observed seller amount agrees with it exactly.
      if (vehicle.ask_price === row.ask_price)
        patch.options = {
          ...(patch.options || row.options),
          priceEvidence: vehicle.options?.priceEvidence,
        };
      if (!Object.keys(patch).length) continue;
      if (receipt)
        appendFileSync(
          receipt,
          JSON.stringify({
            at: new Date().toISOString(),
            before: row,
            patch,
            apply,
          }) + "\n",
        );
      if (apply) {
        const { data, error } = await db
          .from("deals")
          .update(patch)
          .eq("id", row.id)
          .eq("active", true)
          .eq("vin", row.vin)
          .eq("source_url", row.source_url)
          .eq("updated_at", row.updated_at)
          .select("id");
        if (error) throw Error(error.message);
        if (!data?.length) {
          counts.conflicts++;
          continue;
        }
      }
      if (patch.images) counts.photos++;
      if (patch.source_url) counts.links++;
    }
    if (page % 10 === 0 || page === maxPages)
      console.log(JSON.stringify({ apply, ...counts }));
    if (
      page >= Number(body.inventory?.pagination?.totalMatchedPages || Infinity)
    )
      break;
  }
  console.log(JSON.stringify({ final: true, apply, ...counts }));
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
