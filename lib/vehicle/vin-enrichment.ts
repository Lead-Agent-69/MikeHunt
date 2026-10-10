// VIN enrichment shared by GET /api/vin/[vin] and GET /api/vin/[vin]/specs (no third endpoint).
// Full NHTSA vPIC decode (DecodeVinValuesExtended) cached per VIN in vin_decodes with a TTL, and
// NHTSA recalls cached per make/model/year in nhtsa_recalls_cache. Both are free and keyless.
// See docs/vin-enrichment.md for what free data cannot give (option codes, original MSRP, ...).

import type { Deadline } from "./deadline";
import {
  decodeVinExtended,
  getRecalls,
  type RecallLookup,
  type VinDecodeExtended,
} from "./nhtsa";

export const DECODE_TTL_MS = 180 * 24 * 3600_000;
export const RECALLS_TTL_MS = 7 * 24 * 3600_000;

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{ ok: boolean; json: () => Promise<any> }>;
// Minimal Supabase surface we use, so tests can pass an in-memory fake.
type Sb = { from: (table: string) => any };

export interface EnrichOpts {
  fetchImpl?: FetchLike;
  now?: () => number;
  /** Overall upstream deadline for the request (each call also has a 10s timeout). */
  deadline?: Deadline;
  /**
   * Asked right before a new vin_decodes row is written. Return false to serve the live decode
   * without caching it (the route's global write budget is spent), so fabricated VINs can't flood
   * the table. Omitted = always write.
   */
  canWrite?: () => boolean;
}

/** vin_decodes columns written by the extended decode (other columns are left untouched). */
export function decodeToRow(vin: string, d: VinDecodeExtended, nowMs: number) {
  return {
    vin,
    year: d.year,
    make: d.make,
    model: d.model,
    trim: d.trim,
    series: d.series,
    body_class: d.bodyClass,
    doors: d.doors,
    vehicle_type: d.vehicleType,
    manufacturer: d.manufacturer,
    drive_type: d.driveType,
    fuel_type: d.fuelType,
    cylinders: d.cylinders,
    displacement_l: d.displacementL,
    engine: d.engine,
    engine_configuration: d.engineConfiguration,
    engine_hp: d.engineHp,
    engine_model: d.engineModel,
    transmission_style: d.transmissionStyle,
    transmission_speeds: d.transmissionSpeeds,
    gvwr: d.gvwr,
    gvwr_max_lb: d.gvwrMaxLb,
    plant_company: d.plantCompany,
    plant_city: d.plantCity,
    plant_state: d.plantState,
    plant_country: d.plantCountry,
    made_in_usa: d.madeInUsa,
    decode_error_code: d.decodeErrorCode,
    decode_clean: d.decodeClean,
    decoded_at: new Date(nowMs).toISOString(),
    extended_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + DECODE_TTL_MS).toISOString(),
  };
}

export function rowToDecode(c: any): VinDecodeExtended | null {
  if (!c?.make || !c?.model) return null;
  return {
    year: c.year ?? null,
    make: c.make,
    model: c.model,
    trim: c.trim ?? null,
    bodyClass: c.body_class ?? null,
    driveType: c.drive_type ?? null,
    fuelType: c.fuel_type ?? null,
    cylinders: c.cylinders ?? null,
    displacementL: c.displacement_l != null ? Number(c.displacement_l) : null,
    plantCountry: c.plant_country ?? null,
    madeInUsa: c.made_in_usa ?? null,
    series: c.series ?? null,
    doors: c.doors ?? null,
    vehicleType: c.vehicle_type ?? null,
    manufacturer: c.manufacturer ?? null,
    engineConfiguration: c.engine_configuration ?? null,
    engineHp: c.engine_hp != null ? Number(c.engine_hp) : null,
    engineModel: c.engine_model ?? null,
    engine: c.engine ?? null,
    transmissionStyle: c.transmission_style ?? null,
    transmissionSpeeds: c.transmission_speeds ?? null,
    gvwr: c.gvwr ?? null,
    gvwrMaxLb: c.gvwr_max_lb ?? null,
    plantCompany: c.plant_company ?? null,
    plantCity: c.plant_city ?? null,
    plantState: c.plant_state ?? null,
    decodeErrorCode: c.decode_error_code ?? null,
    decodeErrorText: null,
    decodeClean: c.decode_clean === true,
  };
}

/** A cached row is usable as-is when the extended decode wrote it and it hasn't expired. */
export function isDecodeFresh(row: any, nowMs: number): boolean {
  if (!row?.extended_at || !row?.make) return false;
  const exp = row.expires_at ? new Date(row.expires_at).getTime() : NaN;
  return Number.isFinite(exp) && exp > nowMs;
}

export interface VinDecodeResult {
  decode: VinDecodeExtended;
  /** The vin_decodes row as read (may hold mpg/safety extras for the specs endpoint). */
  row: any | null;
  cached: boolean;
  /** True when NHTSA failed and an expired cache row was served instead. */
  stale: boolean;
  /** True when a vin_decodes row exists for this VIN (read from cache or just written). */
  persisted: boolean;
}

/** Decode a VIN: fresh cache row, else live extended decode (written back), else stale row. */
export async function getVinDecode(
  sb: Sb,
  vin: string,
  opts: EnrichOpts = {},
): Promise<VinDecodeResult | null> {
  const now = (opts.now ?? Date.now)();
  let row: any = null;
  try {
    const { data } = await sb
      .from("vin_decodes")
      .select("*")
      .eq("vin", vin)
      .maybeSingle();
    row = data ?? null;
  } catch {
    row = null;
  }
  if (row && isDecodeFresh(row, now)) {
    const d = rowToDecode(row);
    if (d)
      return { decode: d, row, cached: true, stale: false, persisted: true };
  }
  const live = await decodeVinExtended(vin, opts.fetchImpl, {
    deadline: opts.deadline,
  });
  if (live) {
    const write = decodeToRow(vin, live, now);
    // Refreshing an existing row is always fine; only NEW rows spend the write budget.
    let persisted = row != null;
    if (row != null || !opts.canWrite || opts.canWrite()) {
      try {
        // Upsert only the decode columns; mpg/safety/recall columns on an existing row survive.
        const res = await sb
          .from("vin_decodes")
          .upsert(write, { onConflict: "vin" });
        if (!res?.error) persisted = true;
      } catch {
        /* cache write is best-effort */
      }
    }
    return {
      decode: live,
      row: { ...(row ?? {}), ...write },
      cached: false,
      stale: false,
      persisted,
    };
  }
  const old = rowToDecode(row);
  return old
    ? { decode: old, row, cached: true, stale: true, persisted: true }
    : null;
}

export interface RecallsResult extends RecallLookup {
  cached: boolean;
  stale: boolean;
}

export const recallKey = (make: string, model: string, year: number) => ({
  make: make.trim().toUpperCase(),
  model: model.trim().toUpperCase(),
  model_year: year,
});

/** Recalls for a make/model/year, cached 7 days in nhtsa_recalls_cache. Null when unknown. */
export async function getRecallsCached(
  sb: Sb,
  make: string,
  model: string,
  year: number,
  opts: EnrichOpts = {},
): Promise<RecallsResult | null> {
  if (!make || !model || !year) return null;
  const now = (opts.now ?? Date.now)();
  const key = recallKey(make, model, year);
  let row: any = null;
  try {
    const { data } = await sb
      .from("nhtsa_recalls_cache")
      .select("*")
      .eq("make", key.make)
      .eq("model", key.model)
      .eq("model_year", key.model_year)
      .maybeSingle();
    row = data ?? null;
  } catch {
    row = null;
  }
  const fromRow = (stale: boolean): RecallsResult => ({
    count: row.recalls_count,
    campaigns: Array.isArray(row.campaigns) ? row.campaigns : [],
    modelsQueried: Array.isArray(row.models_queried) ? row.models_queried : [],
    scope: "model_year",
    cached: true,
    stale,
  });
  if (row && new Date(row.expires_at).getTime() > now) return fromRow(false);

  const live = await getRecalls(make, model, year, opts.fetchImpl, {
    deadline: opts.deadline,
  });
  if (live) {
    try {
      await sb.from("nhtsa_recalls_cache").upsert(
        {
          ...key,
          recalls_count: live.count,
          campaigns: live.campaigns,
          models_queried: live.modelsQueried,
          fetched_at: new Date(now).toISOString(),
          expires_at: new Date(now + RECALLS_TTL_MS).toISOString(),
        },
        { onConflict: "make,model,model_year" },
      );
    } catch {
      /* best-effort */
    }
    return { ...live, cached: false, stale: false };
  }
  return row ? fromRow(true) : null;
}
