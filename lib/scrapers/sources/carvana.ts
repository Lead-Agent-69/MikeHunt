// lib/scrapers/sources/carvana.ts
// Carvana exposes its ENTIRE inventory (~73k vehicles) via an open JSON API — no Cloudflare, no
// FlareSolverr, no browser. POST to /merch/search/api/v2/search and read inventory.vehicles: clean
// vin/year/make/model/trim/mileage/price/images. The single best free retail comp source we have.

import type { Deal } from "@/types";
import { upsertDeals } from "../pipeline";
import { retailMileage } from "./retail-evidence";

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
    const price = Number(v.price?.total ?? v.price?.incentivizedPrice ?? 0);
    const vin = s(v.vin);
    const vehicleId = Number(v.vehicleId);
    if (
      !Number.isFinite(price) ||
      price <= 0 ||
      !vin ||
      !Number.isSafeInteger(vehicleId) ||
      vehicleId <= 0
    )
      continue;
    const year = Number(v.year) || undefined;
    const make = s(v.make);
    const model = s(v.parentModel) || s(v.model);
    const trim = s(v.trim) || s(v.kbbTrim);
    // Prefer the API's absolute vehicle photos. Relative imageUrl paths have no published origin;
    // constructing a URL from them can return 404 even when the standardized hero is available.
    const abs = (u?: string) => (u && /^https?:\/\//i.test(u) ? u : "");
    const img =
      abs(s(v.imageUrl)) ||
      abs(s(v.standardizedHero)) ||
      abs(s(v.textlessUrl)) ||
      abs(s(v.jellyBeanDesktopUrl)) ||
      abs(s(v.jellyBeanMobileUrl));
    const id = String(vehicleId);
    items.push({
      source: "carvana",
      source_deal_id: vin || id,
      source_url: `https://www.carvana.com/vehicle/${id}`,
      title: `${year || ""} ${make || ""} ${model || ""} ${trim || ""}`
        .replace(/\s+/g, " ")
        .trim(),
      year,
      make,
      model,
      trim,
      vin,
      ask_price: price,
      mileage: retailMileage(v.mileage),
      condition: "clean", // Carvana is reconditioned clean-title retail
      images: img ? [img] : [],
      seller_type: "dealer",
      seller: "Carvana",
      options: {
        priceEvidence: {
          kind: "asking",
          askingPrice: price,
          listedAmount: price,
          checkedAt: new Date().toISOString(),
        },
      },
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
    signal: AbortSignal.timeout(15000),
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
  pageSize = 24,
): Promise<number> {
  // The API echoes larger requested sizes in pagination but returns at most 24 cars. Using that
  // echoed size as the next offset skips cars between pages. Keep the request within its real cap.
  pageSize = Math.max(1, Math.min(24, Math.floor(pageSize) || 24));
  console.log("[Carvana] Starting API scrape...");
  const all: Partial<Deal>[] = [];

  // Page 1 tells us how many pages exist; pick a random window start from there. The API caps deep
  // pagination before the full advertised count. 9,480 is the verified reachable result window.
  const first = await fetchCarvanaPage(1, pageSize);
  if (!first) return 0;
  const totalPages: number = Math.max(
    1,
    Number(first?.inventory?.pagination?.totalMatchedPages) || 1,
  );
  const maxReachablePage = Math.floor(9480 / pageSize);
  const lastStart = Math.max(
    1,
    Math.min(totalPages, maxReachablePage) - maxPages + 1,
  );
  const startPage =
    lastStart > 1 ? 1 + Math.floor(Math.random() * lastStart) : 1;
  console.log(
    `[Carvana] ${totalPages} pages total (reachable ${Math.min(totalPages, maxReachablePage)}) — sampling window from page ${startPage}`,
  );

  if (startPage === 1) all.push(...parseCarvanaVehicles(first));

  for (
    let page = startPage;
    page < startPage + maxPages &&
    page <= Math.min(totalPages, maxReachablePage);
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
