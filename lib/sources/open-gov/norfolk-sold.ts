import type { SupabaseClient } from "@supabase/supabase-js";
import { titleCaseMake, canonicalModel } from "@/lib/vehicle/canonical";
import { scrubContact } from "@/lib/security/scrub-contact";
import { mapNorfolkTowing, type OpenGovVehicle } from "./parse";
import { getLocalWriteContext } from "@/lib/scrapers/local-write-context";

type SourceRow = Record<string, unknown>;

export interface NorfolkSoldInsert {
  vin: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  trim: null;
  mileage: null;
  sold_price: number;
  sold_at: string;
  title: string;
  source: "gov_norfolk_impound";
  source_item_id: string;
  source_url: string;
  currency_code: "USD";
  country_code: "US";
  location_state: "VA";
  basis: "sold";
  sale_channel: "gov_impound_auction";
  attribution: string;
}

export const NORFOLK_ENDPOINT =
  "https://data.norfolk.gov/resource/4dwc-v3t8.json";
export const NORFOLK_DATASET_URL = "https://data.norfolk.gov/d/4dwc-v3t8";
export const NORFOLK_ATTRIBUTION =
  "City of Norfolk, Virginia Open Data: Towing dataset (4dwc-v3t8), Office of Towing & Recovery.";
export const NORFOLK_MIN_SALE_PRICE = 100;
export const NORFOLK_SYNC_WINDOW_DAYS = 180;
export const NORFOLK_OVERLAP_DAYS = 14;
export const OPEN_DATA_TIMEOUT_MS = 30_000;
export const OPEN_DATA_PAGE_MAX_BYTES = 8 * 1024 * 1024;

const MAX_SALE_PRICE = 500_000;
const HEAVY_MAKE =
  /^(FREIGHTLINER|INTERNATIONAL|NAVISTAR|PETERBILT|PETE|KENWORTH|MACK|HINO|WESTERN STAR|STERLING|AUTOCAR|BLUE BIRD|THOMAS)$/i;
const HEAVY_MODEL =
  /^(F-?[4-7]50|E-?450|[CK]?[4-6]500(HD)?|NPR|NQR|NRR|FTR|LCF|MT-?45|MT-?55|M2|TOPKICK|KODIAK)\b/i;
const VIN_RUN = /[A-HJ-NPR-Z0-9]{17,}/gi;

function saneYear(value: number | null | undefined, now: Date) {
  if (!value || !Number.isFinite(value)) return null;
  return value >= 1950 && value <= now.getFullYear() + 1 ? value : null;
}

function cleanVehicleName(value: string | null | undefined) {
  if (!value) return null;
  const withoutVin = value.replace(VIN_RUN, (match) =>
    (match.match(/\d/g)?.length || 0) >= 4 ? " " : match,
  );
  const clean = scrubContact(withoutVin)
    .replace(/[^A-Za-z0-9\u00C0-\u024F .&'/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return clean || null;
}

function displayVehicle(vehicle: OpenGovVehicle) {
  const make = cleanVehicleName(
    vehicle.make ? titleCaseMake(vehicle.make) : null,
  );
  const model = cleanVehicleName(
    vehicle.model ? canonicalModel(vehicle.model) : null,
  );
  return { make, model };
}

function lightVehicle(make: string | null, model: string | null) {
  return (
    !(make && HEAVY_MAKE.test(make)) && !(model && HEAVY_MODEL.test(model))
  );
}

export function norfolkSoldRows(
  rows: SourceRow[],
  now = new Date(),
): NorfolkSoldInsert[] {
  const eligible = rows.filter(
    (row) =>
      !/demolish/i.test(String(row.release_status || "")) &&
      Number(row.sold_for) >= NORFOLK_MIN_SALE_PRICE,
  );
  const { soldComps } = mapNorfolkTowing(eligible);
  const unique = new Map<string, NorfolkSoldInsert>();

  for (const vehicle of soldComps) {
    if (!vehicle.ref || !vehicle.date || !vehicle.amount) continue;
    if (vehicle.amount > MAX_SALE_PRICE) continue;
    const soldAt = new Date(`${vehicle.date}T00:00:00.000Z`);
    if (!Number.isFinite(soldAt.getTime()) || soldAt.getTime() > now.getTime())
      continue;
    const { make, model } = displayVehicle(vehicle);
    if (!lightVehicle(make, model)) continue;
    const year = saneYear(vehicle.year, now);
    const title = `${[year, make, model].filter(Boolean).join(" ") || "Vehicle"} (Norfolk city impound auction)`;
    const row: NorfolkSoldInsert = {
      vin: vehicle.vin,
      year,
      make,
      model,
      trim: null,
      mileage: null,
      sold_price: Math.round(vehicle.amount),
      sold_at: soldAt.toISOString(),
      title: title.slice(0, 180),
      source: "gov_norfolk_impound",
      source_item_id: `norfolk-${vehicle.ref}`,
      source_url: NORFOLK_DATASET_URL,
      currency_code: "USD",
      country_code: "US",
      location_state: "VA",
      basis: "sold",
      sale_channel: "gov_impound_auction",
      attribution: NORFOLK_ATTRIBUTION,
    };
    unique.set(row.source_item_id, row);
  }
  return Array.from(unique.values());
}

async function readJsonCapped(response: Response): Promise<SourceRow[]> {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > OPEN_DATA_PAGE_MAX_BYTES)
    throw new Error("Norfolk response exceeds the 8 MB safety cap");
  const text = await response.text();
  if (Buffer.byteLength(text) > OPEN_DATA_PAGE_MAX_BYTES)
    throw new Error("Norfolk response exceeds the 8 MB safety cap");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed))
    throw new Error("Norfolk returned a non-array payload");
  return parsed as SourceRow[];
}

export async function fetchNorfolkSoldRows(
  since: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since))
    throw new Error("Norfolk since date must be YYYY-MM-DD");
  const fetchImpl = options.fetchImpl || fetch;
  const rows: SourceRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 50_000; offset += pageSize) {
    const params = new URLSearchParams({
      $select:
        "trip_ticket_number,vin_number,vehicle_type,vehicle_make,vehicle_model,vehicle_year,auction_date,sold_for,release_status",
      $where: `sold_for > 0 AND auction_date >= '${since}T00:00:00'`,
      $order: "trip_ticket_number",
      $limit: String(pageSize),
      $offset: String(offset),
    });
    const timeout = AbortSignal.timeout(OPEN_DATA_TIMEOUT_MS);
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeout])
      : timeout;
    const response = await fetchImpl(`${NORFOLK_ENDPOINT}?${params}`, {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "MikeHunt-Open-Data/1.0 (+https://github.com/Lead-Agent-69/MikeHunt)",
      },
      signal,
    });
    if (!response.ok) throw new Error(`Norfolk HTTP ${response.status}`);
    const page = await readJsonCapped(response);
    rows.push(...page);
    if (page.length < pageSize) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return rows;
}

function isoDateDaysAgo(days: number, now: Date) {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export async function resolveNorfolkSince(
  supabase: SupabaseClient,
  now = new Date(),
) {
  const floor = isoDateDaysAgo(NORFOLK_SYNC_WINDOW_DAYS, now);
  const { data, error } = await supabase
    .from("sold_listings")
    .select("sold_at")
    .eq("source", "gov_norfolk_impound")
    .not("sold_at", "is", null)
    .order("sold_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Norfolk cursor failed: ${error.message}`);
  const latest = data?.sold_at ? new Date(data.sold_at) : null;
  if (!latest || !Number.isFinite(latest.getTime())) return floor;
  const overlap = new Date(latest.getTime() - NORFOLK_OVERLAP_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return overlap > floor ? overlap : floor;
}

export async function writeNorfolkSoldRows(
  supabase: SupabaseClient,
  rows: NorfolkSoldInsert[],
) {
  let written = 0;
  for (let offset = 0; offset < rows.length; offset += 250) {
    const chunk = rows.slice(offset, offset + 250);
    const { data, error } = await supabase
      .from("sold_listings")
      .upsert(chunk, {
        onConflict: "source,source_item_id",
        ignoreDuplicates: true,
      })
      .select("source_item_id");
    if (error) throw new Error(`Norfolk sold write failed: ${error.message}`);
    written += data?.length || 0;
  }
  return written;
}

export async function scrapeNorfolkSold(
  options: { signal?: AbortSignal } = {},
) {
  if (
    process.env.CACHE_ONLY_MODE === "true" ||
    getLocalWriteContext()?.cacheOnly
  ) {
    console.log("[norfolk-sold] cache-only mode; hosted sold rows unchanged");
    return 0;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Norfolk sold sync credentials are missing");
  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = await resolveNorfolkSince(supabase);
  const sourceRows = await fetchNorfolkSoldRows(since, {
    signal: options.signal,
  });
  const rows = norfolkSoldRows(sourceRows);
  return writeNorfolkSoldRows(supabase, rows);
}
