// lib/scrapers/generic-extractor.ts
//
// The chameleon's hands. Once detectPlatform() says WHERE the data lives, this pulls vehicle listings out
// of ANY site with no source-specific parser — the structured way, so it's robust, not regex-brittle:
//
//   • next-data → walk the __NEXT_DATA__ JSON island for vehicle-shaped objects (cars.com, autotrader,
//                 truecar, offerup all ship their listings here)
//   • ld-json   → read schema.org Vehicle/Car/Product/ItemList blocks (the dealer-site standard; Municibid)
//
// A new source that uses either pattern needs ZERO custom code — genericExtract(html) returns Deals. For
// `spa-api` (empty shell) or opaque `html`, it honestly returns [] (those need an API capture or a bespoke
// parser — the detector already flags which). Mirrors extract-market-value.ts: schema-agnostic by shape,
// sanity-bounded so junk can't leak in. Every candidate must look like a real titled vehicle (year + make).

import type { Deal } from "@/types";
import { detectPlatform } from "./platform-detector";

const YEAR_RE = /\b(19[5-9]\d|20[0-4]\d)\b/;
const VIN_RE = /\b([A-HJ-NPR-Z0-9]{17})\b/; // VINs exclude I/O/Q

// Real-world JSON-LD / __NEXT_DATA__ is often slightly malformed (e.g. Municibid emits `\&quot;`, an
// invalid JSON escape). Try a clean parse first; on failure, strip bad backslash-escapes (any `\` not
// before a valid escape char) and retry — so one broken string doesn't cost us the whole listing block.
export function safeJsonParse(raw: string): any | null {
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(raw.replace(/\\([^"\\/bfnrtu])/g, "$1"));
    } catch {
      return null;
    }
  }
}

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (isFinite(n) && /\d/.test(v)) return n;
  }
  return null;
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

// Field name families seen across vehicle schemas. First hit wins.
const F = {
  year: [
    "year",
    "modelYear",
    "vehicleYear",
    "yearOfManufacture",
    "vehicleModelDate",
  ],
  make: [
    "make",
    "makeName",
    "brand",
    "manufacturer",
    "vehicleMake",
    "makeCode",
  ],
  model: ["model", "modelName", "vehicleModel", "modelCode"],
  trim: ["trim", "trimName", "subModel", "series"],
  price: [
    "price",
    "listPrice",
    "salePrice",
    "askingPrice",
    "currentBid",
    "sellingPrice",
    "displayPrice",
  ],
  mileage: ["mileage", "odometer", "miles", "mileageFromOdometer"],
  // serialNumber / productID / mpn carry the VIN on DealerFire offers and ProMax cards; VIN_RE
  // keeps anything that isn't a 17-char VIN out.
  vin: [
    "vin",
    "vehicleIdentificationNumber",
    "serialNumber",
    "productID",
    "mpn",
  ],
  url: ["url", "vdpUrl", "detailUrl", "link", "href"],
  image: ["image", "imageUrl", "primaryImage", "photoUrl", "thumbnail"],
  title: ["title", "name", "heading", "displayName"],
};

function pick(obj: Record<string, any>, keys: string[]): unknown {
  for (const k of Object.keys(obj)) {
    if (keys.some((want) => k.toLowerCase() === want.toLowerCase())) {
      const v = obj[k];
      if (v != null && v !== "") return v;
    }
  }
  return undefined;
}

export interface RawVehicle {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  price?: number;
  mileage?: number;
  url?: string;
  image?: string;
  title?: string;
  /** Dealer stock / listing id (schema.org sku). ProMax list cards carry no url, only this. */
  sku?: string;
  /** schema.org availability says SoldOut / OutOfStock / Discontinued. */
  sold?: boolean;
}

/** Pull year/make/model from a "2016 Ford Explorer Police Interceptor" style title. */
function fromTitle(title: string): {
  year?: number;
  make?: string;
  model?: string;
} {
  const ym = title.match(YEAR_RE);
  if (!ym) return {};
  const year = parseInt(ym[0], 10);
  const after = title
    .slice((ym.index || 0) + 4)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return { year, make: after[0], model: after.slice(1, 3).join(" ") };
}

/** Read a vehicle out of one object (any schema), via field-name families + a title fallback. */
export function readVehicle(obj: Record<string, any>): RawVehicle | null {
  if (!obj || typeof obj !== "object") return null;

  const mileageRaw = pick(obj, F.mileage);
  const v: RawVehicle = {
    year: toNum(pick(obj, F.year)) ?? undefined,
    make: str(deref(pick(obj, F.make))),
    model: str(deref(pick(obj, F.model))),
    trim: str(deref(pick(obj, F.trim))) || undefined,
    vin: (str(pick(obj, F.vin)).match(VIN_RE) || [])[1],
    price: priceOf(pick(obj, F.price) ?? obj.offers ?? obj.priceSpecification),
    mileage:
      toNum(
        typeof mileageRaw === "object"
          ? (mileageRaw as any)?.value
          : mileageRaw,
      ) ?? undefined,
    url: str(pick(obj, F.url)) || str(obj.offers?.url) || undefined,
    image: imageOf(pick(obj, F.image)),
    title: str(pick(obj, F.title)) || undefined,
    sku:
      str(obj.sku) ||
      (typeof obj.sku === "number" ? String(obj.sku) : "") ||
      undefined,
    sold: SOLD_AVAILABILITY.test(
      str(obj.availability) || str(offerOf(obj.offers)?.availability),
    ),
  };
  if (!v.sold) delete v.sold;
  if (!v.sku) delete v.sku;

  // Backfill year/make/model from the title when the object only carries a display name (ItemList rows).
  if ((!v.year || !v.make) && v.title) {
    const t = fromTitle(v.title);
    v.year = v.year || t.year;
    v.make = v.make || t.make;
    v.model = v.model || t.model;
  }

  // A real titled vehicle needs a plausible year + a make. Price optional (auctions may be pre-bid).
  if (!v.year || v.year < 1950 || v.year > 2030) return null;
  if (!v.make) return null;
  return v;
}

const SOLD_AVAILABILITY = /SoldOut|OutOfStock|Discontinued/i;

function offerOf(v: unknown): any {
  if (Array.isArray(v)) return v[0];
  return v && typeof v === "object" ? v : undefined;
}

// schema.org nests the name inside {name:"Ford"} for brand/model; deref it.
function deref(v: unknown): unknown {
  if (v && typeof v === "object" && "name" in (v as any))
    return (v as any).name;
  return v;
}

// Price may be a number, a string, an Offer ({price}), or a PriceSpecification ({price}).
function priceOf(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return priceOf(v[0]);
  if (typeof v === "object") {
    const o = v as any;
    return priceOf(o.price ?? o.lowPrice ?? o.priceSpecification?.price);
  }
  const n = toNum(v);
  return n != null && n >= 100 && n <= 500000 ? n : undefined;
}

function imageOf(v: unknown): string | undefined {
  if (!v) return undefined;
  if (Array.isArray(v)) return imageOf(v[0]);
  if (typeof v === "object")
    return str((v as any).url) || str((v as any).contentUrl) || undefined;
  return str(v) || undefined;
}

function toDeal(v: RawVehicle, source: string): Partial<Deal> | null {
  const title =
    v.title || [v.year, v.make, v.model].filter(Boolean).join(" ").trim();
  if (!title) return null;
  return {
    source,
    source_url: v.url,
    vin: v.vin,
    title,
    year: v.year,
    make: v.make,
    model: v.model,
    trim: v.trim,
    ask_price: v.price ?? 0,
    mileage: v.mileage,
    images: v.image ? [v.image] : [],
    scraped_at: new Date().toISOString(),
  };
}

/** Deep-walk any JSON for vehicle-shaped objects. Bounded depth. */
function walkForVehicles(root: any, out: RawVehicle[], depth = 0): void {
  if (!root || typeof root !== "object" || depth > 8 || out.length > 500)
    return;
  if (Array.isArray(root)) {
    for (const item of root) walkForVehicles(item, out, depth + 1);
    return;
  }
  const v = readVehicle(root);
  if (v) out.push(v);
  for (const k of Object.keys(root)) {
    const child = root[k];
    if (child && typeof child === "object")
      walkForVehicles(child, out, depth + 1);
  }
}

/** Extract vehicles from the __NEXT_DATA__ JSON island. */
export function extractFromNextData(html: string): RawVehicle[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  const data = safeJsonParse(m[1]);
  if (!data) return [];
  const out: RawVehicle[] = [];
  walkForVehicles(data?.props ?? data, out);
  return dedupe(out);
}

/**
 * Extract vehicles from schema.org JSON-LD blocks (Vehicle/Car/Product/ItemList). Dealer platforms
 * nest listings differently; all of these are read:
 *  - top-level Car/Vehicle/Product nodes, one per block or an array (ProMax, Municibid)
 *  - ItemList → itemListElement[].item (Overfuel)
 *  - @graph → SearchResultsPage.mainEntity ItemList (space.auto on WordPress/Yoast)
 *  - SearchResultsPage.offers[] → Offer {name, url, price, itemOffered} (DealerFire / DealerSocket)
 */
export function extractFromJsonLd(html: string): RawVehicle[] {
  const out: RawVehicle[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const json = safeJsonParse(m[1].trim());
    if (!json) continue;
    const roots = Array.isArray(json) ? json : json["@graph"] || [json];
    for (const root of roots) readJsonLdNode(root, out, 0);
  }
  return dedupe(out);
}

function readJsonLdNode(node: any, out: RawVehicle[], depth: number): void {
  if (!node || typeof node !== "object" || depth > 4) return;
  if (Array.isArray(node)) {
    for (const n of node) readJsonLdNode(n, out, depth + 1);
    return;
  }
  // ItemList of listings → each element by name/url (url may sit on the ListItem or the item).
  if (Array.isArray(node.itemListElement)) {
    for (const el of node.itemListElement) {
      const obj = el?.item && typeof el.item === "object" ? el.item : el;
      const v = readVehicle({
        ...obj,
        title: obj?.name,
        url: obj?.url || el?.url,
      });
      if (v) out.push(v);
    }
  }
  if (node.mainEntity && typeof node.mainEntity === "object")
    readJsonLdNode(node.mainEntity, out, depth + 1);
  // DealerFire: SearchResultsPage { offers: [Offer { name, url, price, serialNumber, itemOffered }] }
  if (
    Array.isArray(node.offers) &&
    node.offers.some((o: any) => o?.itemOffered)
  ) {
    for (const offer of node.offers) {
      if (!offer || typeof offer !== "object") continue;
      const item =
        offer.itemOffered && typeof offer.itemOffered === "object"
          ? offer.itemOffered
          : {};
      const v = readVehicle({
        ...item,
        title: offer.name || item.name,
        url: offer.url || item.url,
        price: offer.price ?? priceOf(item.offers),
        serialNumber: offer.serialNumber || item.serialNumber,
        availability: offer.availability,
        image: offer.image || item.image,
      });
      if (v) out.push(v);
    }
    return;
  }
  const v = readVehicle(node);
  if (v) out.push(v);
}

function dedupe(list: RawVehicle[]): RawVehicle[] {
  const seen = new Set<string>();
  const out: RawVehicle[] = [];
  for (const v of list) {
    const key =
      v.vin ||
      v.url ||
      `${v.year}|${v.make}|${v.model}|${v.trim || ""}|${v.price ?? ""}|${v.mileage ?? ""}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

/**
 * Schema-agnostic vehicle extraction for ANY site. Uses detectPlatform() to pick the strategy, returns
 * Deals. Empty array for spa-api (needs an API capture) or opaque html (needs a bespoke parser).
 */
export function genericExtract(
  html: string,
  source = "generic",
): Partial<Deal>[] {
  const { dataStrategy } = detectPlatform(html);
  let raws: RawVehicle[] = [];
  if (dataStrategy === "next-data") raws = extractFromNextData(html);
  else if (dataStrategy === "ld-json") raws = extractFromJsonLd(html);
  else {
    // Even when the framework signal points elsewhere, opportunistically try both structured islands —
    // they often coexist with other markup. Cheap, and only shape-valid vehicles survive.
    raws = dedupe([...extractFromJsonLd(html), ...extractFromNextData(html)]);
  }
  return raws
    .map((v) => toDeal(v, source))
    .filter((d): d is Partial<Deal> => d != null);
}
