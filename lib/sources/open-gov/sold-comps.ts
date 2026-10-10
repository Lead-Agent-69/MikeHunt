// Free sold comps into sold_listings. Pure mappers (open-gov rows / GSA dataset rows → sold_listings
// rows) plus one shared, idempotent writer. Sources and what their price means:
//
//   gov_norfolk_impound  Norfolk VA city impound auction, `sold_for` (public domain)   basis 'sold'
//   gov_seattle_fleet    Seattle FAS fleet sale, `sale_price` (Public Domain)          basis 'sold'
//   gsa_closing_bid      GSA Auctions last observed bid at close (GovAuctions.app      basis 'last_bid'
//                        dataset, CC BY 4.0; attribution stored on every row)
//
// GovDeals/AllSurplus sold lots are mapped in lib/scrapers/sources/lqdt-maestro.ts and go through the
// same writer. Every row carries sale_channel so impound and fleet prices never read as retail.
// Facts only: no plates, no owner data, no photos. Cars and trucks only.

import type { SupabaseClient } from "@supabase/supabase-js";
import { titleCaseMake, canonicalModel } from "@/lib/vehicle/canonical";
import type { GovSaleChannel } from "@/lib/scoring/sale-channels";
import { scrubContact } from "@/lib/security/scrub-urls";
import {
  extractMake,
  extractModel,
  extractYear,
} from "@/lib/scrapers/tools/deal-normalizer";
import {
  isOpenGovCarOrTruck,
  mapNorfolkTowing,
  mapSeattleFleetSold,
  type OpenGovVehicle,
} from "./parse";

export type SoldBasisValue = "sold" | "last_bid";
export type SaleChannel = GovSaleChannel;

export interface SoldListingInsert {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  mileage: number | null;
  sold_price: number;
  sold_at: string;
  title: string;
  source: string;
  source_item_id: string;
  source_url: string;
  currency_code: "USD";
  country_code: "US";
  location_state: string | null;
  basis: SoldBasisValue;
  sale_channel: SaleChannel;
  attribution: string;
}

type Row = Record<string, unknown>;

export const NORFOLK_SOURCE = "gov_norfolk_impound";
export const SEATTLE_SOURCE = "gov_seattle_fleet";
export const GSA_SOURCE = "gsa_closing_bid";

export const NORFOLK_ENDPOINT =
  "https://data.norfolk.gov/resource/4dwc-v3t8.json";
export const SEATTLE_ENDPOINT =
  "https://cos-data.seattle.gov/resource/y6ef-jf2w.json";
export const GSA_DATASET_CSV =
  "https://huggingface.co/datasets/govauctions/us-gsa-surplus-auctions/resolve/main/us-gsa-surplus-auctions.csv";

export const NORFOLK_ATTRIBUTION =
  "City of Norfolk, VA open data: Towing (data.norfolk.gov/d/4dwc-v3t8), Office of Towing & Recovery. Public domain.";
export const SEATTLE_ATTRIBUTION =
  "City of Seattle open data: Sold Fleet Equipment (data.seattle.gov/d/y6ef-jf2w). Public Domain.";
/** The credit line the dataset card asks for, verbatim (CC BY 4.0). */
export const GSA_ATTRIBUTION =
  "Source: U.S. Government (GSA) Surplus Auction Dataset, GovAuctions.app, https://govauctions.app/research/open-dataset (CC BY 4.0)";

/** Norfolk crusher/scrap rows sell at a fixed scrap price; they are not vehicle sale comps. */
export const NORFOLK_MIN_SALE_PRICE = 100;

const MAX_SANE_PRICE = 500_000;

/** GSA lots under this are parts/accessory lots titled like vehicles ("... Rear Seats"). */
export const GSA_MIN_BID = 200;

/** Medium/heavy-duty makes and chassis that aren't car or light-truck comps. */
const HEAVY_MAKE =
  /^(FREIGHTLINER|INTERNATIONAL|NAVISTAR|PETERBILT|PETE|KENWORTH|KENW|MACK|HINO|WESTERN STAR|STERLING|AUTOCAR|BLUE BIRD|THOMAS)$/i;
const HEAVY_MODEL =
  /^(F-?[4-7]50|E-?450|[CK]?[4-6]500(HD)?|NPR|NQR|NRR|FTR|LCF|MT-?45|MT-?55|M2|TOPKICK|KODIAK)\b/i;
/** Lots that are parts or accessories even though the title names a vehicle. */
const PARTS_LOT =
  /\b(seats?|parts|engines?|motors?|tires?|wheels?|rims?|doors?|bumpers?|tailgates?|transmissions?|camper shell|toppers?|accessor(y|ies)|light ?bars?|plow|salt spreader|bed liner|lot of)\b/i;

/** Cars and light trucks only: drops medium/heavy chassis and parts lots. */
export function isLightVehicleComp(
  make: string | null,
  model: string | null,
  title = "",
): boolean {
  if (make && HEAVY_MAKE.test(make.trim())) return false;
  if (model && HEAVY_MODEL.test(model.trim())) return false;
  if (title && PARTS_LOT.test(title)) return false;
  return true;
}

function saneYear(
  y: number | null | undefined,
  now = new Date(),
): number | null {
  if (!y || !Number.isFinite(y)) return null;
  return y >= 1950 && y <= now.getFullYear() + 1 ? y : null;
}

function display(v: OpenGovVehicle) {
  const make = v.make ? titleCaseMake(v.make) : null;
  const model = v.model ? canonicalModel(v.model) : null;
  return { make, model };
}

// Gov titles are built from year/make/model only (never the lot's free text), and even those fields
// are scrubbed, because a seller-typed make/model can carry a VIN or contact details (Ren #331 R1).
// VINs: any run of 17+ VIN characters (no I/O/Q) holding at least 4 digits, with NO word-boundary
// requirement, so a VIN glued to other characters ("SN1GNSKAKC0FR000001", "VIN#1GNS...x") goes too.
// Phones, emails and URLs: the shared scrubContact from lib/security/scrub-urls (#314/#323).
const VIN_RUN = /[A-HJ-NPR-Z0-9]{17,}/gi;
const CONTACT_PLACEHOLDER = /\[(?:url|email|phone)\]/g;

/** Remove VIN-like runs, URLs, emails and phone numbers from display text. */
export function scrubGovText(s: string): string {
  const noVin = String(s ?? "").replace(VIN_RUN, (m) =>
    (m.match(/\d/g)?.length ?? 0) >= 4 ? " " : m,
  );
  return scrubContact(noVin)
    .replace(CONTACT_PLACEHOLDER, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Max stored length for a seller-typed make or model on a gov-lane row. */
export const GOV_NAME_MAX = 40;

/** Clean a seller-typed make/model at write time: scrubbed, plain characters only, <= 40 chars. */
export function cleanGovName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = scrubGovText(v)
    .replace(/[^A-Za-z0-9\u00C0-\u024F .&'/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, GOV_NAME_MAX)
    .trim();
  return s || null;
}

/** Display title for a gov/fleet/surplus row: scrubbed "year make model (suffix)". */
export function govTitle(
  parts: Array<string | number | null | undefined>,
  suffix: string,
) {
  const head = scrubGovText(parts.filter(Boolean).join(" "));
  return `${head || "Vehicle"} (${suffix})`.slice(0, 180);
}
const shortTitle = govTitle;

/** Venue suffix for a gov-lane row's display title, from its source (never from stored free text). */
export function govVenueLabel(source: unknown, basis?: unknown): string {
  switch (source) {
    case NORFOLK_SOURCE:
      return "Norfolk VA city impound auction";
    case SEATTLE_SOURCE:
      return "Seattle city fleet sale";
    case GSA_SOURCE:
      return "GSA Auctions, last observed bid at close";
    case "govdeals":
      return "GovDeals sold lot, winning bid before buyer's premium";
    case "allsurplus":
      return "AllSurplus sold lot, winning bid before buyer's premium";
    default:
      return basis === "last_bid"
        ? "government auction, last observed bid"
        : "government auction";
  }
}

/**
 * Norfolk towing rows → sold rows. Uses the #286 parser (mapNorfolkTowing: cars/trucks, sold_for > 0),
 * then drops Demolished rows and scrap-price rows. The row id is the city's trip ticket number.
 */
export function norfolkSoldRows(
  rows: Row[],
  now = new Date(),
): SoldListingInsert[] {
  const kept = rows.filter(
    (r) =>
      !/demolish/i.test(String(r.release_status || "")) &&
      Number(r.sold_for) >= NORFOLK_MIN_SALE_PRICE,
  );
  const { soldComps } = mapNorfolkTowing(kept);
  const out: SoldListingInsert[] = [];
  for (const v of soldComps) {
    if (!v.ref || !v.date || !v.amount) continue;
    if (v.amount > MAX_SANE_PRICE) continue;
    if (new Date(v.date).getTime() > now.getTime()) continue;
    const { make, model } = display(v);
    if (!isLightVehicleComp(make, model)) continue;
    const year = saneYear(v.year, now);
    out.push({
      vin: v.vin,
      year,
      make,
      model,
      trim: null,
      mileage: null, // the dataset has no mileage field
      sold_price: Math.round(v.amount),
      sold_at: `${v.date}T00:00:00.000Z`,
      title: shortTitle([year, make, model], "Norfolk VA city impound auction"),
      source: NORFOLK_SOURCE,
      source_item_id: `norfolk-${v.ref}`,
      source_url: "https://www.norfolk.gov/416/Towing-Recovery",
      currency_code: "USD",
      country_code: "US",
      location_state: "VA",
      basis: "sold",
      sale_channel: "gov_impound_auction",
      attribution: NORFOLK_ATTRIBUTION,
    });
  }
  return dedupe(out);
}

/**
 * Seattle fleet model codes → retail model names, so the rows pool with comps for the same car.
 * The suffix H marks a hybrid; PIU is Ford's Police Interceptor Utility (an Explorer).
 */
const SEATTLE_MODEL: Record<string, string> = {
  ESCAPEH: "Escape",
  PIU: "Explorer",
  PIUH: "Explorer",
  HIGHLDR: "Highlander",
  HIGHLDRH: "Highlander",
  COLRADO: "Colorado",
  RAV4H: "RAV4",
  TRANSCT: "Transit Connect",
  TRANSIT350: "Transit",
  CMAX: "C-Max",
  SUBNK15: "Suburban",
  BZ4X: "bZ4X",
};

/** Seattle sold fleet rows → sold rows (cars and light trucks via the #286 parser's group filter). */
export function seattleSoldRows(
  rows: Row[],
  now = new Date(),
): SoldListingInsert[] {
  const byRef = new Map<string, Row>();
  for (const r of rows) if (r.equip_id) byRef.set(String(r.equip_id), r);
  const out: SoldListingInsert[] = [];
  // TRUCK in Seattle's system_group is medium/heavy (flushers, dump trucks, semis): not a comp.
  const light = rows.filter(
    (r) => String(r.system_group || "").toUpperCase() !== "TRUCK",
  );
  for (const v0 of mapSeattleFleetSold(light)) {
    const code = String(v0.model || "")
      .trim()
      .toUpperCase();
    const v: OpenGovVehicle = {
      ...v0,
      // Seattle's MERC is Mercedes-Benz (Sprinter vans), not Mercury.
      make:
        v0.make === "MERCURY" && code === "SPRINTER"
          ? "MERCEDES-BENZ"
          : v0.make,
      model: SEATTLE_MODEL[code] ?? v0.model,
    };
    if (!v.ref || !v.date || !v.amount || v.amount > MAX_SANE_PRICE) continue;
    if (!isOpenGovCarOrTruck({ make: v.make, model: v.model, body: null }))
      continue;
    if (new Date(v.date).getTime() > now.getTime()) continue;
    const { make, model } = display(v);
    if (
      !isLightVehicleComp(
        make,
        model,
        String(byRef.get(v.ref)?.description || ""),
      )
    )
      continue;
    const year = saneYear(v.year, now);
    const soldBy = String(byRef.get(v.ref)?.sold_by || "").trim();
    out.push({
      vin: v.vin,
      year,
      make,
      model,
      trim: null,
      mileage: null,
      sold_price: Math.round(v.amount),
      sold_at: `${v.date}T00:00:00.000Z`,
      title: shortTitle(
        [year, make, model],
        `Seattle city fleet sale${soldBy ? `, ${soldBy.toLowerCase()}` : ""}`,
      ),
      source: SEATTLE_SOURCE,
      source_item_id: `seattle-${v.ref}`,
      source_url: "https://data.seattle.gov/d/y6ef-jf2w",
      currency_code: "USD",
      country_code: "US",
      location_state: "WA",
      basis: "sold",
      sale_channel: "gov_fleet_auction",
      attribution: SEATTLE_ATTRIBUTION,
    });
  }
  return dedupe(out);
}

/**
 * GovAuctions.app GSA dataset rows → 'last_bid' rows. Only `category = vehicles`, `sold = true`,
 * a positive bid, a model year and a recognised make in the title, and cars/trucks only. The price is
 * the last observed bid at close, so basis is 'last_bid' and the title says so. Never 'sold'.
 */
export function gsaClosingBidRows(
  rows: Row[],
  now = new Date(),
): SoldListingInsert[] {
  const out: SoldListingInsert[] = [];
  for (const r of rows) {
    if (String(r.category || "").trim() !== "vehicles") continue;
    if (
      String(r.sold || "")
        .trim()
        .toLowerCase() !== "true"
    )
      continue;
    if (
      String(r.currency || "USD")
        .trim()
        .toUpperCase() !== "USD"
    )
      continue;
    const bid = Number(
      String(r.current_or_final_bid ?? "").replace(/[$,\s]/g, ""),
    );
    if (!Number.isFinite(bid) || bid < GSA_MIN_BID || bid > MAX_SANE_PRICE)
      continue;
    const id = String(r.id || "").trim();
    const url = String(r.source_url || "").trim();
    const ended = String(r.ended_at || "").trim();
    if (!id || !/^https:\/\/(www\.)?gsaauctions\.gov\//i.test(url)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ended)) continue;
    if (new Date(`${ended}T00:00:00Z`).getTime() > now.getTime()) continue;
    const rawTitle = String(r.title || "")
      .replace(/\s+/g, " ")
      .trim();
    const year = saneYear(extractYear(rawTitle) ?? null, now);
    if (!year) continue;
    const make = extractMake(rawTitle);
    if (!make) continue;
    const model = extractModel(rawTitle, make, year) ?? null;
    if (!isOpenGovCarOrTruck({ make, model, description: rawTitle })) continue;
    if (!isLightVehicleComp(make, model, rawTitle)) continue;
    const state = String(r.state || "")
      .trim()
      .toUpperCase();
    out.push({
      vin: null, // the dataset has no VIN or mileage columns
      year,
      make: titleCaseMake(make),
      model: model ? canonicalModel(model) : null,
      trim: null,
      mileage: null,
      sold_price: Math.round(bid),
      sold_at: `${ended}T00:00:00.000Z`,
      title: shortTitle(
        [year, titleCaseMake(make), model ? canonicalModel(model) : null],
        "GSA Auctions, last observed bid at close",
      ),
      source: GSA_SOURCE,
      source_item_id: id,
      source_url: url,
      currency_code: "USD",
      country_code: "US",
      location_state: /^[A-Z]{2}$/.test(state) ? state : null,
      basis: "last_bid",
      sale_channel: "gov_surplus_auction",
      attribution: GSA_ATTRIBUTION,
    });
  }
  return dedupe(out);
}

function dedupe(rows: SoldListingInsert[]): SoldListingInsert[] {
  const m = new Map<string, SoldListingInsert>();
  for (const r of rows) m.set(`${r.source}|${r.source_item_id}`, r);
  return Array.from(m.values());
}

/** Minimal RFC 4180 CSV reader (quoted fields, doubled quotes, CRLF). Header row → objects. */
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = "";
  let rec: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      rec.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      rec.push(field);
      records.push(rec);
      rec = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || rec.length) {
    rec.push(field);
    records.push(rec);
  }
  const [header, ...body] = records.filter((r) => r.some((f) => f !== ""));
  if (!header) return [];
  return body.map((r) =>
    Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""])),
  );
}

const NEW_COLUMNS = ["basis", "sale_channel", "attribution"] as const;

/** PostgREST/Postgres saying one of this migration's columns doesn't exist yet. */
export function isMissingSoldColumn(
  error: { code?: string | null; message?: string | null } | null | undefined,
) {
  if (!error) return false;
  const msg = String(error.message || "");
  return (
    (error.code === "42703" ||
      error.code === "PGRST204" ||
      /does not exist|could not find/i.test(msg)) &&
    NEW_COLUMNS.some((c) => new RegExp(`\\b${c}\\b`).test(msg))
  );
}

export interface WriteSoldResult {
  attempted: number;
  written: number;
  skipped: string | null;
}

/**
 * Idempotent upsert on (source, source_item_id), the existing unique index. Rows that are already
 * there are left alone (immutable sale records). Refuses to write when migration 20261010410000 is
 * not applied: without basis/attribution a GSA bid could read as a sale and lose its CC BY credit.
 */
export async function writeSoldListings(
  sb: SupabaseClient,
  rows: SoldListingInsert[],
  opts: { chunk?: number } = {},
): Promise<WriteSoldResult> {
  const chunk = opts.chunk ?? 500;
  let written = 0;
  for (let i = 0; i < rows.length; i += chunk) {
    const slice = rows.slice(i, i + chunk);
    const { data, error } = await sb
      .from("sold_listings")
      .upsert(slice, {
        onConflict: "source,source_item_id",
        ignoreDuplicates: true,
      })
      .select("source_item_id");
    if (error) {
      if (isMissingSoldColumn(error))
        return {
          attempted: rows.length,
          written,
          skipped:
            "migration 20261010410000 (basis/sale_channel/attribution) not applied yet",
        };
      throw new Error(`sold_listings upsert failed: ${error.message}`);
    }
    written += data?.length ?? 0;
  }
  return { attempted: rows.length, written, skipped: null };
}

const UA =
  "MikeHunt open-data reader (+https://github.com/Lead-Agent-69/MikeHunt)";

/** Per-request timeouts and body caps for the open-data fetchers (Ren #302). */
export const OPEN_DATA_TIMEOUT_MS = 30_000;
export const GSA_TIMEOUT_MS = 60_000;
export const SODA_PAGE_MAX_BYTES = 8 * 1024 * 1024;
/** The GSA CSV is ~6.6 MB (2026-10-10); refuse anything past 12 MB rather than buffer it. */
export const GSA_CSV_MAX_BYTES = 12 * 1024 * 1024;

/** Read a response body as text, failing once it passes maxBytes (header check + streamed count). */
export async function readTextCapped(
  res: Response,
  maxBytes: number,
  label: string,
): Promise<string> {
  const declared = Number(res.headers?.get?.("content-length") || 0);
  if (declared > maxBytes)
    throw new Error(`${label}: body ${declared} bytes exceeds cap ${maxBytes}`);
  const body = res.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== "function") {
    const text = await res.text();
    if (Buffer.byteLength(text) > maxBytes)
      throw new Error(`${label}: body exceeds cap ${maxBytes}`);
    return text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error(`${label}: body exceeds cap ${maxBytes}`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");
}

async function readJsonCapped<T>(
  res: Response,
  maxBytes: number,
  label: string,
): Promise<T> {
  return JSON.parse(await readTextCapped(res, maxBytes, label)) as T;
}

/** Norfolk SoQL: auctioned rows with a sale price since `sinceIso` (YYYY-MM-DD). Paged, polite. */
export async function fetchNorfolkSoldRows(
  sinceIso: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Row[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceIso))
    throw new Error("sinceIso must be YYYY-MM-DD");
  const out: Row[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 50_000; offset += PAGE) {
    const qs = new URLSearchParams({
      $select:
        "trip_ticket_number,vin_number,vehicle_type,vehicle_make,vehicle_model,vehicle_year,storage_lot,auction_date,sold_for,release_status",
      $where: `sold_for > 0 AND auction_date >= '${sinceIso}T00:00:00'`,
      $order: "trip_ticket_number",
      $limit: String(PAGE),
      $offset: String(offset),
    });
    const res = await fetchImpl(`${NORFOLK_ENDPOINT}?${qs}`, {
      headers: { Accept: "application/json", "User-Agent": UA },
      signal: AbortSignal.timeout(OPEN_DATA_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Norfolk HTTP ${res.status}`);
    const page = await readJsonCapped<Row[]>(
      res,
      SODA_PAGE_MAX_BYTES,
      "Norfolk",
    );
    out.push(...page);
    if (page.length < PAGE) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return out;
}

/** Seattle sold fleet: the whole dataset (267 rows as of 2026-10-10). */
export async function fetchSeattleSoldRows(
  fetchImpl: typeof fetch = fetch,
): Promise<Row[]> {
  const res = await fetchImpl(`${SEATTLE_ENDPOINT}?$limit=5000`, {
    headers: { Accept: "application/json", "User-Agent": UA },
    signal: AbortSignal.timeout(OPEN_DATA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Seattle HTTP ${res.status}`);
  return readJsonCapped<Row[]>(res, SODA_PAGE_MAX_BYTES, "Seattle");
}

export async function fetchGsaDatasetRows(
  fetchImpl: typeof fetch = fetch,
): Promise<Row[]> {
  const res = await fetchImpl(GSA_DATASET_CSV, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(GSA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GSA dataset HTTP ${res.status}`);
  return parseCsv(await readTextCapped(res, GSA_CSV_MAX_BYTES, "GSA dataset"));
}

/** One summary line per source for dry runs and logs. */
export function summarize(rows: SoldListingInsert[]) {
  const months = new Map<string, number>();
  for (const r of rows) {
    const m = r.sold_at.slice(0, 7);
    months.set(m, (months.get(m) || 0) + 1);
  }
  const prices = rows.map((r) => r.sold_price).sort((a, b) => a - b);
  return {
    rows: rows.length,
    medianPrice: prices.length ? prices[Math.floor(prices.length / 2)] : null,
    firstSoldAt: rows.length ? rows.map((r) => r.sold_at).sort()[0] : null,
    lastSoldAt: rows.length
      ? rows
          .map((r) => r.sold_at)
          .sort()
          .at(-1)
      : null,
    byMonth: Object.fromEntries(Array.from(months.entries()).sort()),
  };
}
