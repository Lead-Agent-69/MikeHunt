// lib/scrapers/tools/structured-extract.ts
// The EXTRACTION-layer fallback ladder — resilience below the fetch ladder (smartFetch). A site can
// redesign its HTML overnight and break every CSS selector, but it almost never drops its JSON-LD
// (schema.org, for Google) or its framework hydration blob (__NEXT_DATA__ / __NUXT__). So these give each
// scraper "fallback after fallback": custom DOM parser → JSON-LD → embedded JSON → content-clean + AI.
// Each tier is CHEAPER and MORE STABLE than the next, so we try them in that order and stop at the first
// that yields data. Pure, dependency-free (regex over HTML), $0.

export interface StructuredItem {
  title?: string;
  price?: number;
  url?: string;
  image?: string;
  // vehicle
  vin?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  // property
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  beds?: number;
  baths?: number;
  sqft?: number;
}

const num = (v: unknown): number | undefined => {
  if (v == null) return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const str = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
};

// Some sites nest the real value: {"@type":"Brand","name":"Toyota"} or {"value":"..."} or ["a","b"].
const deep = (v: unknown): string | undefined => {
  if (v == null) return undefined;
  if (Array.isArray(v)) return deep(v[0]);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(o.name ?? o.value ?? o["@value"]);
  }
  return str(v);
};

const firstOffer = (o: Record<string, unknown>): Record<string, unknown> => {
  const offers = o.offers;
  if (Array.isArray(offers))
    return (offers[0] as Record<string, unknown>) || {};
  if (offers && typeof offers === "object")
    return offers as Record<string, unknown>;
  return {};
};

const VEHICLE_TYPES = /vehicle|car|motorcycle|truck|automobile/i;
const PROPERTY_TYPES =
  /residence|house|apartment|realestatelisting|singlefamily|property|place|accommodation/i;

// Map one schema.org node → a StructuredItem (vehicle or property), or null if it isn't listing-shaped.
function mapNode(node: unknown): StructuredItem | null {
  if (!node || typeof node !== "object") return null;
  const o = node as Record<string, unknown>;
  const type = Array.isArray(o["@type"])
    ? o["@type"].join(" ")
    : String(o["@type"] || "");
  const offer = firstOffer(o);
  const price =
    num(offer.price) ??
    num((offer.priceSpecification as Record<string, unknown>)?.price) ??
    num(o.price);
  const title = str(o.name) ?? str(o.headline);
  const url = str(o.url) ?? str(offer.url);
  const image = deep(o.image);

  if (
    VEHICLE_TYPES.test(type) ||
    o.vehicleIdentificationNumber ||
    o.mileageFromOdometer
  ) {
    const item: StructuredItem = {
      title,
      price,
      url,
      image,
      vin: str(o.vehicleIdentificationNumber),
      year: num(
        o.vehicleModelDate ?? o.modelDate ?? o.productionDate ?? o.releaseDate,
      ),
      make: deep(o.brand ?? o.manufacturer),
      model: deep(o.model),
      trim: deep(o.vehicleConfiguration ?? o.trim),
      mileage: num(
        (o.mileageFromOdometer as Record<string, unknown>)?.value ??
          o.mileageFromOdometer,
      ),
    };
    return item.vin || item.make || item.title ? item : null;
  }

  if (PROPERTY_TYPES.test(type) || o.address) {
    const addr = (o.address as Record<string, unknown>) || {};
    const item: StructuredItem = {
      title,
      price,
      url,
      image,
      address: str(addr.streetAddress) ?? title,
      city: str(addr.addressLocality),
      state: str(addr.addressRegion),
      zip: str(addr.postalCode),
      beds: num(o.numberOfRooms ?? o.numberOfBedrooms),
      baths: num(o.numberOfBathroomsTotal ?? o.numberOfBathrooms),
      sqft: num((o.floorSize as Record<string, unknown>)?.value ?? o.floorSize),
    };
    return item.address || item.title ? item : null;
  }
  return null;
}

// Recursively walk parsed JSON-LD (handles @graph, arrays, ItemList) collecting listing nodes.
function walkLd(node: unknown, out: StructuredItem[], depth = 0): void {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) {
    for (const n of node) walkLd(n, out, depth + 1);
    return;
  }
  if (typeof node !== "object") return;
  const o = node as Record<string, unknown>;
  const mapped = mapNode(o);
  if (mapped) out.push(mapped);
  // Descend into common containers even when the parent mapped (e.g. an Offer wrapping items).
  for (const key of ["@graph", "itemListElement", "item", "mainEntity"]) {
    if (o[key]) walkLd(o[key], out, depth + 1);
  }
}

/** Tier: schema.org JSON-LD — the most standardized, stable listing data on the page. */
export function extractJsonLd(html: string): StructuredItem[] {
  const out: StructuredItem[] = [];
  const blocks =
    html.match(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ) || [];
  for (const raw of blocks) {
    const json = raw
      .replace(/^<script[^>]*>/i, "")
      .replace(/<\/script>\s*$/i, "")
      .trim();
    try {
      walkLd(JSON.parse(json), out);
    } catch {
      /* malformed block — skip, try the next */
    }
  }
  return out;
}

/** Tier: framework hydration blobs (__NEXT_DATA__ etc.) — present on most modern SPA listing sites. */
export function extractEmbeddedJson(html: string): StructuredItem[] {
  const out: StructuredItem[] = [];
  const nextData = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  const candidates: string[] = [];
  if (nextData?.[1]) candidates.push(nextData[1]);
  const win = html.match(
    /window\.__(?:NUXT|INITIAL_STATE|PRELOADED_STATE)__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i,
  );
  if (win?.[1]) candidates.push(win[1]);
  for (const c of candidates) {
    try {
      const root = JSON.parse(c);
      // Deep-scan for any object that looks like a listing (has a VIN or an address+price).
      const stack: unknown[] = [root];
      let seen = 0;
      while (stack.length && seen < 20_000) {
        const n = stack.pop();
        seen += 1;
        if (!n || typeof n !== "object") continue;
        const o = n as Record<string, unknown>;
        const isVehicle = !!(o.vin || o.vehicleIdentificationNumber);
        const isProperty = !!(o.address && (o.price || o.listPrice));
        if (isVehicle) {
          // Hydration blobs use PLAIN field names (vin/make/year), not schema.org's.
          const item: StructuredItem = {
            vin: str(o.vin ?? o.vehicleIdentificationNumber),
            year: num(o.year ?? o.modelYear ?? o.vehicleModelDate),
            make: deep(o.make ?? o.brand ?? o.manufacturer),
            model: deep(o.model),
            trim: deep(o.trim),
            price: num(o.price ?? o.listPrice ?? o.askingPrice ?? o.salePrice),
            mileage: num(o.mileage ?? o.odometer),
            title: str(o.title ?? o.name ?? o.heading),
            url: str(o.url ?? o.vdpUrl ?? o.detailUrl),
          };
          if (item.vin || item.make) out.push(item);
        } else if (isProperty) {
          const a = (o.address as Record<string, unknown>) || {};
          out.push({
            address: str(
              (typeof o.address === "string" ? o.address : a.streetAddress) ??
                o.title,
            ),
            city: str(a.addressLocality ?? a.city ?? o.city),
            state: str(a.addressRegion ?? a.state ?? o.state),
            zip: str(a.postalCode ?? a.zip ?? o.zip),
            price: num(o.price ?? o.listPrice),
            beds: num(o.beds ?? o.bedrooms ?? o.numberOfBedrooms),
            baths: num(o.baths ?? o.bathrooms),
            sqft: num(o.sqft ?? o.livingArea ?? o.squareFeet),
          });
        }
        for (const v of Object.values(o))
          if (v && typeof v === "object") stack.push(v);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

/**
 * Run async providers in priority order; return the result of the FIRST that yields a non-empty array.
 * The organizing primitive for "fallback after fallback" — cheap/stable tiers first, expensive last.
 * A provider that throws is treated as empty and the ladder continues.
 */
export async function firstNonEmpty<T>(
  providers: Array<{ name: string; run: () => Promise<T[]> | T[] }>,
  onWin?: (name: string, count: number) => void,
): Promise<T[]> {
  for (const p of providers) {
    try {
      const r = await p.run();
      if (r && r.length) {
        onWin?.(p.name, r.length);
        return r;
      }
    } catch {
      /* tier failed — fall through to the next */
    }
  }
  return [];
}
