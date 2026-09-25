import { smartFetch } from "../smart-fetch";
import { enrichAndStore } from "./shared";

// IAA (Insurance Auto Auctions) — salvage / total-loss auction. The website SEARCH is Imperva-walled (0
// rows via plain scrape), BUT the sitemap + per-lot `vehicledetail` pages serve real listing JSON with an
// ordinary browser identity (Imperva only challenges some egress). So we enumerate live lots from the
// sitemap, then pull each lot's embedded `inventoryView.attributes` JSON. smartFetch escalates to the
// headed real-Chrome tier automatically when a fetch returns a challenge, so the sitemap resolves on the
// worker fleet even though a flagged serverless IP gets "Pardon Our Interruption". FlareSolverr can't help
// here (Imperva, not Cloudflare) — the headed tier is the right escalation, which smartFetch already owns.
//
// The obfuscated sitemap path is published in iaai.com/robots.txt.
const SITEMAP_INDEX = "https://www.iaai.com/Xj9rDOVMEi0hc38S/sitemap_index.xml";

interface Attrs {
  StockNumber?: string;
  Year?: string;
  Make?: string;
  Model?: string;
  Series?: string;
  City?: string;
  State?: string;
  Zip?: string;
  VIN?: string;
}

// Pull the vehicle attributes out of a lot's embedded JSON (block with inventoryView.attributes).
function parseDetail(html: string): Attrs | null {
  const blocks =
    html.match(
      /<script[^>]*type="application\/json"[^>]*>[\s\S]*?<\/script>/gi,
    ) || [];
  for (const raw of blocks) {
    const jsonStr = raw
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>\s*$/i, "");
    let data: unknown;
    try {
      data = JSON.parse(jsonStr);
    } catch {
      continue;
    }
    const a = (data as { inventoryView?: { attributes?: Attrs } })
      ?.inventoryView?.attributes;
    if (a && (a.VIN || a.StockNumber)) return a;
  }
  return null;
}

const locs = (xml: string): string[] =>
  (xml.match(/<loc>([^<]+)<\/loc>/gi) || []).map((m) =>
    m.replace(/<\/?loc>/gi, "").trim(),
  );

export async function scrapeIAA(
  _searchTerm = "",
  limit = 100,
): Promise<number> {
  // 1) Enumerate live lot URLs from the sitemap (index → sub-sitemaps).
  const lotUrls: string[] = [];
  try {
    const { html: idx, blocked } = await smartFetch(SITEMAP_INDEX);
    if (blocked || !idx) return 0;
    const subs = locs(idx).filter((u) => /sitemap\d*\.xml/i.test(u));
    // Fall back to the index itself if it already lists vehicledetail URLs directly.
    const sitemaps = subs.length ? subs : [SITEMAP_INDEX];
    for (const sub of sitemaps.slice(0, 3)) {
      const { html: sm, blocked: b2 } = await smartFetch(sub);
      if (b2 || !sm) continue;
      for (const u of locs(sm)) {
        if (/vehicledetail/i.test(u)) lotUrls.push(u);
        if (lotUrls.length >= limit) break;
      }
      if (lotUrls.length >= limit) break;
    }
  } catch {
    return 0;
  }
  if (!lotUrls.length) return 0;

  // 2) Pull each lot's detail JSON → normalize → store. Bounded + polite.
  let stored = 0;
  for (const url of lotUrls.slice(0, limit)) {
    try {
      const { html, blocked } = await smartFetch(url);
      if (blocked || !html) continue;
      const a = parseDetail(html);
      if (!a || !a.StockNumber) continue;
      const yr = parseInt(String(a.Year || ""), 10) || undefined;
      const title =
        [yr, a.Make, a.Model, a.Series].filter(Boolean).join(" ").trim() ||
        "IAA Vehicle";
      await enrichAndStore({
        source: "iaa",
        source_category: "salvage",
        external_id: String(a.StockNumber),
        title,
        // Logged-out VIN is masked (…******); only keep a full VIN.
        vin: a.VIN && !a.VIN.includes("*") ? a.VIN.trim() : undefined,
        year: yr,
        make: a.Make ? String(a.Make).trim() : undefined,
        model: a.Model ? String(a.Model).trim() : undefined,
        title_type: "salvage", // IAA is a total-loss / salvage auction
        location_city: a.City ? String(a.City).trim() : undefined,
        location_state: a.State ? String(a.State).trim() : undefined,
        location_zip: a.Zip ? String(a.Zip).trim() : undefined,
        listing_url: url,
      });
      stored += 1;
    } catch {
      /* skip this lot, keep going */
    }
    await new Promise((r) => setTimeout(r, 300)); // polite between lots
  }
  console.log(
    `[IAA] stored ${stored} salvage lots (of ${lotUrls.length} enumerated)`,
  );
  return stored;
}
