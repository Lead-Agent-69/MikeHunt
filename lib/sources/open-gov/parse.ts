// Pure parsers for the open government vehicle feeds in ./feeds. No network, no DB: each turns a
// source payload into facts-only rows (VIN/year/make/model/mileage/amount/date/location + link back).
// Cars and trucks only. Amounts keep their meaning (`amountKind`) so the UI never shows a minimum
// bid or a tow bill as an asking price.

import { isCarOrTruck } from "@/lib/scrapers/vehicle-class";

export type AmountKind =
  | "fixed_price"
  | "sale_price"
  | "minimum_bid"
  | "total_owed"
  | null;

export interface OpenGovVehicle {
  feedId: string;
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  body?: string | null;
  mileage?: number | null;
  amount: number | null;
  amountKind: AmountKind;
  /** ISO date: sale date (comps), auction/close date (leads), or list date. */
  date: string | null;
  location: string | null;
  /** Source row identifier (lot, tag, equip id, ticket). */
  ref: string | null;
  /** Official page to link back to. Never a rehosted file, never a gated venue. */
  link: string;
}

const VIN_RE = /\b[A-HJ-NPR-Z0-9]{17}\b/;

/** Common fleet/impound make abbreviations → make. Unknown codes pass through upper-cased. */
const MAKE_ABBR: Record<string, string> = {
  ACUR: "ACURA",
  BUIC: "BUICK",
  CADI: "CADILLAC",
  CHEV: "CHEVROLET",
  CHRY: "CHRYSLER",
  DODG: "DODGE",
  FORD: "FORD",
  FRHT: "FREIGHTLINER",
  FREI: "FREIGHTLINER",
  GMC: "GMC",
  HOND: "HONDA",
  HYUN: "HYUNDAI",
  INFI: "INFINITI",
  ISUZ: "ISUZU",
  JAGU: "JAGUAR",
  JEEP: "JEEP",
  KIA: "KIA",
  MBENZ: "MERCEDES-BENZ",
  STRN: "SATURN",
  SUZU: "SUZUKI",
  LEXS: "LEXUS",
  LEXU: "LEXUS",
  LINC: "LINCOLN",
  MAZD: "MAZDA",
  MERC: "MERCURY",
  MERZ: "MERCEDES-BENZ",
  MERCEDES: "MERCEDES-BENZ",
  MITS: "MITSUBISHI",
  NISS: "NISSAN",
  PONT: "PONTIAC",
  PORS: "PORSCHE",
  RAM: "RAM",
  SATU: "SATURN",
  SCIO: "SCION",
  SUBA: "SUBARU",
  SUZI: "SUZUKI",
  TESL: "TESLA",
  TOYO: "TOYOTA",
  TOYT: "TOYOTA",
  VOLK: "VOLKSWAGEN",
  VOLV: "VOLVO",
  VW: "VOLKSWAGEN",
  MINI: "MINI",
  AUDI: "AUDI",
  BMW: "BMW",
  FIAT: "FIAT",
  LNDR: "LAND ROVER",
  LAND: "LAND ROVER",
};

/** Makes that are never a car or truck on these lists (motorcycles, trailers, equipment). */
const NON_VEHICLE_MAKES =
  /^(HARL|HARLEY|KAWA|KAWASAKI|YAMA|YAMAHA|SUZUKI MC|DUCA|TRIU|VESP|KTM|POLA|POLARIS|CANA|CAN-AM|TAOT|TAO|TRLR|TRAILER|UTIL|DYNP|KLMR|JOHN|DEER|BOBC|CATE|KUBO)\b/i;
const NON_VEHICLE_BODY =
  /^(MC|MOTO|MOTORCYCLE|BIKE|MOPED|SCOOTER|TRL|TRLR|TRAILER|BOAT|ATV|UTV|CAMPER|RV|MH)$/i;

export function normalizeMake(raw: string | null | undefined): string | null {
  const m = String(raw || "")
    .trim()
    .toUpperCase();
  if (!m || m === "OTHER" || m === "UNK" || m === "UNKNOWN") return null;
  return MAKE_ABBR[m] ?? m;
}

/** "02" → 2002, "88" → 1988, "2016" → 2016. `now` pins the century pivot for tests. */
export function expandYear(
  raw: string | number | null | undefined,
  now = new Date(),
): number | null {
  const s = String(raw ?? "").trim();
  if (!/^\d{2}(\d{2})?$/.test(s)) return null;
  if (s.length === 4) return Number(s);
  const yy = Number(s);
  const pivot = (now.getFullYear() + 1) % 100;
  return yy <= pivot ? 2000 + yy : 1900 + yy;
}

function num(raw: unknown): number | null {
  const n = Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && String(raw ?? "").trim() !== "" ? n : null;
}

function isoDate(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Cars and trucks only: drops motorcycles, trailers, equipment and anything isCarOrTruck rejects. */
export function isOpenGovCarOrTruck(v: {
  make?: string | null;
  model?: string | null;
  body?: string | null;
  description?: string | null;
}): boolean {
  if (v.make && NON_VEHICLE_MAKES.test(v.make)) return false;
  if (v.body && NON_VEHICLE_BODY.test(v.body.trim())) return false;
  const title = [v.make, v.model, v.body, v.description]
    .filter(Boolean)
    .join(" ");
  return isCarOrTruck(title);
}

// ── Socrata feeds ──────────────────────────────────────────────────────────────────────────────

/** Seattle system_group values that are cars and trucks (the rest is equipment, trailers, bikes). */
const SEATTLE_CAR_GROUPS = new Set([
  "PICKUP",
  "VAN",
  "TRUCK",
  "PATROL",
  "SUV",
  "SEDAN",
  "MINIVAN",
]);

type Row = Record<string, unknown>;

export function mapSeattleFleetSurplus(rows: Row[]): OpenGovVehicle[] {
  return rows
    .filter((r) =>
      SEATTLE_CAR_GROUPS.has(String(r.system_group || "").toUpperCase()),
    )
    .map((r) => ({
      feedId: "gov-seattle-fleet-surplus",
      vin: VIN_RE.test(String(r.vin || "")) ? String(r.vin) : null,
      year: expandYear(r.year as string),
      make: normalizeMake(r.make as string),
      model: (r.model as string) || null,
      body: (r.equipment_type as string) || null,
      amount: null,
      amountKind: null,
      date: isoDate(r.retirement_date),
      location: "Seattle, WA",
      ref: (r.equip_id as string) || null,
      link: "https://data.seattle.gov/d/6gnm-7jex",
    }));
}

export function mapSeattleFleetSold(rows: Row[]): OpenGovVehicle[] {
  return rows
    .filter((r) =>
      SEATTLE_CAR_GROUPS.has(String(r.system_group || "").toUpperCase()),
    )
    .map((r) => ({
      feedId: "gov-seattle-fleet-sold",
      vin: VIN_RE.test(String(r.vin || "")) ? String(r.vin) : null,
      year: expandYear(r.year as string),
      make: normalizeMake(r.make as string),
      model: (r.model as string) || null,
      body: (r.equipment_type as string) || null,
      amount: num(r.sale_price),
      amountKind: "sale_price" as const,
      date: isoDate(r.sale_date),
      location: "Seattle, WA",
      ref: (r.equip_id as string) || null,
      link: "https://data.seattle.gov/d/y6ef-jf2w",
    }))
    .filter((v) => v.amount !== null && v.amount > 0);
}

const NORFOLK_NON_CAR_TYPES =
  /motorcycle|moped|scooter|trailer|boat|atv|camper|bus/i;

/**
 * Norfolk towing rows split two ways: still on the lot (impounded/abandoned → lead) and sold at a
 * city auction (sold_for > 0 → sale_price comp). Released rows are dropped.
 */
export function mapNorfolkTowing(rows: Row[]): {
  leads: OpenGovVehicle[];
  soldComps: OpenGovVehicle[];
} {
  const leads: OpenGovVehicle[] = [];
  const soldComps: OpenGovVehicle[] = [];
  for (const r of rows) {
    if (NORFOLK_NON_CAR_TYPES.test(String(r.vehicle_type || ""))) continue;
    const base = {
      feedId: "gov-norfolk-towing",
      vin: VIN_RE.test(String(r.vin_number || ""))
        ? String(r.vin_number)
        : null,
      year: expandYear(r.vehicle_year as string),
      make: normalizeMake(r.vehicle_make as string),
      model: (r.vehicle_model as string) || null,
      body: (r.vehicle_type as string) || null,
      location: r.storage_lot ? `${r.storage_lot}, Norfolk, VA` : "Norfolk, VA",
      ref: (r.trip_ticket_number as string) || null,
      link: "https://www.norfolk.gov/416/Towing-Recovery",
    };
    if (!isOpenGovCarOrTruck({ make: base.make, model: base.model })) continue;
    const sold = num(r.sold_for);
    if (sold && sold > 0) {
      soldComps.push({
        ...base,
        amount: sold,
        amountKind: "sale_price",
        date: isoDate(r.auction_date),
      });
    } else if (/impound|abandon/i.test(String(r.release_status || ""))) {
      leads.push({
        ...base,
        amount: null,
        amountKind: null,
        date: isoDate(r.gate_arrived_date),
      });
    }
  }
  return { leads, soldComps };
}

// ── West Virginia direct sales (SharePoint HTML) ────────────────────────────────────────────────

/** Reads the labeled mobile blocks ("Tag #:", "Year:", "Make and Model:", "VIN:", "Mileage:", "Price:"). */
export function parseWvDirectSales(html: string): OpenGovVehicle[] {
  const out: OpenGovVehicle[] = [];
  const seen = new Set<string>();
  const label = (block: string, name: string) => {
    const m = block.match(new RegExp(`<b>${name}:\\s*</b>\\s*([^<]*)`, "i"));
    return m ? m[1].replace(/&amp;/g, "&").trim() : "";
  };
  for (const block of html.split(/<b>Tag #:\s*<\/b>/i).slice(1)) {
    const chunk = `<b>Tag #: </b>${block}`;
    const vin = label(chunk, "VIN");
    if (!VIN_RE.test(vin) || seen.has(vin)) continue;
    seen.add(vin);
    const makeModel = label(chunk, "Make and Model").replace(/\s+/g, " ");
    const [make, ...rest] = makeModel.split(" ");
    const model = rest.join(" ") || null; // trailing color is kept (the list merges model + color)
    if (!isOpenGovCarOrTruck({ make, model })) continue;
    out.push({
      feedId: "gov-wv-direct-vehicle-sales",
      vin,
      year: expandYear(label(chunk, "Year")),
      make: normalizeMake(make),
      model,
      mileage: num(label(chunk, "Mileage")),
      amount: num(label(chunk, "Price")),
      amountKind: "fixed_price",
      date: null,
      location: "West Virginia (State Surplus, Dunbar)",
      ref: label(chunk, "Tag #") || null,
      link: "https://administration.wv.gov/surplus/Inventory/state-property/Pages/Vehicle-Sales-List.aspx",
    });
  }
  return out;
}

// ── Text-PDF VIN lists (Baltimore, Montgomery County MD, Honolulu, Delaware) ─────────────────────

export interface VinListOptions {
  feedId: string;
  link: string;
  location: string;
  /** Auction or list date for every row (ISO). */
  date?: string | null;
  amountKind?: AmountKind;
  /** false when the list has no make column (Delaware: "year model fleet# miles VIN"). */
  hasMake?: boolean;
  now?: Date;
}

/**
 * Generic reader for `pdftotext -layout` output: one row per line that carries a VIN. Picks the year
 * (2- or 4-digit token), the make (first alphabetic token that is a known make or abbreviation, else
 * the first alphabetic token), a body code, and a trailing dollar amount when present.
 */
export function parseVinListText(
  text: string,
  opts: VinListOptions,
): OpenGovVehicle[] {
  const out: OpenGovVehicle[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const vm = line.match(VIN_RE);
    if (!vm) continue;
    const vin = vm[0];
    if (seen.has(vin)) continue;
    const tokens = line.replace(vin, " ").trim().split(/\s+/);
    const yearTok =
      tokens.find((t) => /^(19|20)\d{2}$/.test(t)) ??
      tokens.find((t) => /^\d{2}$/.test(t));
    const alpha = tokens.filter((t) => /^[A-Z][A-Z-]{1,}$/.test(t));
    const makeTok =
      alpha.find((t) => MAKE_ABBR[t]) ??
      alpha.find((t) => t.length >= 3) ??
      null;
    const bodyTok =
      alpha.find(
        (t) =>
          NON_VEHICLE_BODY.test(t) ||
          /^(SUV|TRK|VAN|4DR|2DR|4DSD|2DSD|MPVH|PK|PU|SW|CP|SD)$/.test(t),
      ) ??
      tokens.find((t) => /^[24]DR$/.test(t)) ??
      null;
    const money = Array.from(
      line.matchAll(/\$?\s?(\d{1,3}(?:,\d{3})*\.\d{2})/g),
    ).map((m) => num(m[1]));
    const amount = money.length ? money[money.length - 1] : null;
    const hasMake = opts.hasMake !== false;
    if (hasMake && makeTok && NON_VEHICLE_MAKES.test(makeTok)) continue;
    if (bodyTok && NON_VEHICLE_BODY.test(bodyTok)) continue;
    const milesTok = tokens.find((t) => /^\d{1,3}(,\d{3})+$/.test(t));
    seen.add(vin);
    out.push({
      feedId: opts.feedId,
      vin,
      year: expandYear(yearTok ?? null, opts.now),
      // No make column: leave it null and decode make/model from the VIN (NHTSA vPIC).
      make: hasMake ? normalizeMake(makeTok) : null,
      model: hasMake ? null : modelAfterYear(tokens, yearTok) || null,
      body: hasMake ? bodyTok : null,
      mileage: hasMake ? null : num(milesTok),
      amount: opts.amountKind ? amount : null,
      amountKind: opts.amountKind && amount !== null ? opts.amountKind : null,
      date: opts.date ?? null,
      location: opts.location,
      ref: null,
      link: opts.link,
    });
  }
  return out;
}

/** Delaware-style rows: the model is every token between the year and the first all-digit token. */
function modelAfterYear(tokens: string[], yearTok: string | undefined): string {
  const start = yearTok ? tokens.indexOf(yearTok) + 1 : 0;
  const out: string[] = [];
  for (const t of tokens.slice(start)) {
    if (/^[\d,]+$/.test(t)) break;
    out.push(t);
  }
  return out.join(" ");
}

// ── Boston impound lots (no VIN): two columns of "E<n> MAKE COLOR YY" ───────────────────────────

export function parseBostonLots(
  text: string,
  opts: { date?: string | null; now?: Date } = {},
): OpenGovVehicle[] {
  const out: OpenGovVehicle[] = [];
  const seen = new Set<string>();
  for (const m of Array.from(
    text.matchAll(/\b(E\d{1,3})\s+([A-Z]{2,5})\s+([A-Z]{2})\s+(\d{2}|UNK)\b/g),
  )) {
    const [, lot, makeRaw, , yy] = m;
    if (seen.has(lot)) continue;
    seen.add(lot);
    if (
      /^(DUMP|TRLR|MOTO|BOAT)$/.test(makeRaw) ||
      NON_VEHICLE_MAKES.test(makeRaw)
    )
      continue;
    out.push({
      feedId: "gov-boston-impound-auction",
      vin: null,
      year: yy === "UNK" ? null : expandYear(yy, opts.now),
      make: normalizeMake(makeRaw),
      model: null,
      amount: null,
      amountKind: null,
      date: opts.date ?? null,
      location: "200 Frontage Rd, Boston, MA",
      ref: lot,
      link: "https://www.boston.gov/departments/transportation/abandoned-and-impounded-vehicles",
    });
  }
  return out;
}

// ── Memphis surplus XLSX rows (after a sheet reader turns them into objects) ────────────────────

export function mapMemphisSurplusRow(row: Row): OpenGovVehicle | null {
  const pick = (...keys: string[]) => {
    for (const k of Object.keys(row)) {
      if (keys.includes(k.trim().toLowerCase())) return row[k];
    }
    return undefined;
  };
  const vin = String(pick("vin", "vin #", "vin number") ?? "")
    .trim()
    .toUpperCase();
  const make = normalizeMake(pick("make") as string);
  const model = (pick("model") as string) || null;
  const body = (pick("body", "body type", "type") as string) || null;
  if (!VIN_RE.test(vin)) return null;
  if (!isOpenGovCarOrTruck({ make, model, body })) return null;
  return {
    feedId: "gov-memphis-auto-auctions-surplus",
    vin,
    year: expandYear(pick("year") as string),
    make,
    model,
    body,
    amount: null,
    amountKind: null,
    date: null,
    location: "Memphis, TN",
    ref: String(pick("unit", "unit #", "unit number") ?? "") || null,
    link: "https://memphistn.gov/city-auto-auctions/",
  };
}
