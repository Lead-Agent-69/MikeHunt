// lib/scrapers/sources/carvana.ts
// Carvana exposes its ENTIRE inventory (~73k vehicles) via an open JSON API — no Cloudflare, no
// FlareSolverr, no browser. POST to /merch/search/api/v2/search and read inventory.vehicles: clean
// vin/year/make/model/trim/mileage/price/images. The single best free retail comp source we have.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";

const CARVANA_API = "https://apik.carvana.io/merch/search/api/v2/search";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const s = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Map a Carvana search-API response (inventory.vehicles) into deal rows. */
export function parseCarvanaVehicles(json: any): Partial<Deal>[] {
  const vehicles = json?.inventory?.vehicles;
  if (!Array.isArray(vehicles)) return [];
  const items: Partial<Deal>[] = [];
  for (const v of vehicles) {
    if (!v || typeof v !== "object") continue;
    const price = Number(
      v.price?.total ?? v.price?.incentivizedPrice ?? v.price?.msrp ?? 0,
    );
    const vin = s(v.vin);
    if (!price || !vin) continue;
    const year = Number(v.year) || undefined;
    const make = s(v.make);
    const model = s(v.parentModel) || s(v.model);
    const trim = s(v.trim) || s(v.kbbTrim);
    // Carvana's `imageUrl` is a RELATIVE path (domain stripped) → renders as a broken image. Prefer any
    // ABSOLUTE url: the real photo if it's absolute, else the full jellyBean stock image of the same
    // year/make/model. A correct stock photo beats a broken one. (Was storing the broken relative URL.)
    const abs = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : "");
    const img =
      abs(s(v.imageUrl)) ||
      abs(s(v.jellyBeanDesktopUrl)) ||
      abs(s(v.jellyBeanMobileUrl));
    const id = String(v.vehicleId ?? v.stockNumber ?? vin);
    items.push({
      source: "carvana",
      source_deal_id: vin || id,
      source_url: v.vdpSlug
        ? `https://www.carvana.com/vehicle/${v.vdpSlug}`
        : `https://www.carvana.com/vehicle/${id}`,
      title: `${year || ""} ${make || ""} ${model || ""} ${trim || ""}`
        .replace(/\s+/g, " ")
        .trim(),
      year,
      make,
      model,
      trim,
      vin,
      ask_price: price,
      mileage: Number(v.mileage) || 0,
      condition: "clean", // Carvana is reconditioned clean-title retail
      images: img ? [img] : [],
      seller_type: "dealer",
      seller: "Carvana",
      metadata: { delivery_available: true, seven_day_return: true },
      scraped_at: new Date().toISOString(),
    });
  }
  return items;
}

async function fetchCarvanaPage(
  page: number,
  pageSize: number,
): Promise<any | null> {
  const res = await fetch(CARVANA_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": UA,
      Origin: "https://www.carvana.com",
      Accept: "application/json",
    },
    body: JSON.stringify({ pagination: { page, pageSize }, filters: {} }),
  });
  if (!res.ok) {
    console.warn(`[Carvana] page ${page} HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

// Default sort returns the same first N vehicles every run. To build real comp BREADTH over time,
// each run samples a RANDOM contiguous window of the ~6k-page inventory — successive cron runs cover
// different make/model/year buckets instead of re-fetching the same 1000 cars.
export async function scrapeCarvana(
  maxPages = 15,
  pageSize = 50,
): Promise<number> {
  console.log("[Carvana] Starting API scrape...");
  const all: Partial<Deal>[] = [];

  // Page 1 tells us how many pages exist; pick a random window start from there. The API caps deep
  // pagination at a ~10k-result offset, so the reachable window is bounded regardless of total.
  const first = await fetchCarvanaPage(1, pageSize);
  if (!first) return 0;
  const totalPages: number = Math.max(
    1,
    Number(first?.inventory?.pagination?.totalMatchedPages) || 1,
  );
  const maxReachablePage = Math.floor(9900 / pageSize); // offset cap (~page 198 @ size 50)
  const lastStart = Math.max(
    1,
    Math.min(totalPages, maxReachablePage) - maxPages,
  );
  const startPage =
    lastStart > 1 ? 1 + Math.floor(Math.random() * lastStart) : 1;
  console.log(
    `[Carvana] ${totalPages} pages total (reachable ${Math.min(totalPages, maxReachablePage)}) — sampling window from page ${startPage}`,
  );

  if (startPage === 1) all.push(...parseCarvanaVehicles(first));

  for (
    let page = startPage;
    page < startPage + maxPages && page <= totalPages;
    page++
  ) {
    if (page === 1 && startPage === 1) continue; // already captured above
    try {
      const json = await fetchCarvanaPage(page, pageSize);
      if (!json) break;
      const items = parseCarvanaVehicles(json);
      if (!items.length) break;
      all.push(...items);
      await new Promise((r) => setTimeout(r, 700)); // be polite
    } catch (e) {
      console.warn(`[Carvana] page ${page} failed:`, (e as Error).message);
      break;
    }
  }

  console.log(`[Carvana] Found ${all.length} vehicles`);
  if (all.length > 0) await upsertDeals(all);
  return all.length;
}
