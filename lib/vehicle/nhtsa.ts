// Free authoritative vehicle data — NHTSA vPIC (VIN decode) + NHTSA Recalls. No API key, no rate
// limit, public-domain data. Pure parsers (testable) + best-effort fetchers. Decode is immutable per
// VIN; recalls change over time. Callers cache results in the vin_decodes table.

import { isValidVin } from "./vin";

type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; json: () => Promise<any> }>;

export interface VinDecode {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyClass: string | null;
  driveType: string | null;
  fuelType: string | null;
  cylinders: number | null;
  displacementL: number | null;
  plantCountry: string | null;
  madeInUsa: boolean | null;
}

const numOrNull = (v: any): number | null => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const strOrNull = (v: any): string | null => {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
};

/** Parse an NHTSA DecodeVinValues Results[0] object into our shape. */
export function parseDecode(r: any): VinDecode {
  const plant = strOrNull(r?.PlantCountry);
  return {
    year: numOrNull(r?.ModelYear),
    make: strOrNull(r?.Make),
    model: strOrNull(r?.Model),
    trim: strOrNull(r?.Trim) || strOrNull(r?.Series),
    bodyClass: strOrNull(r?.BodyClass),
    driveType: strOrNull(r?.DriveType),
    fuelType: strOrNull(r?.FuelTypePrimary),
    cylinders: numOrNull(r?.EngineCylinders),
    displacementL: numOrNull(r?.DisplacementL),
    plantCountry: plant,
    madeInUsa: plant ? /united states|usa/i.test(plant) : null,
  };
}

/** Decode a VIN via NHTSA vPIC. Returns null for invalid VINs or on any failure. */
export async function decodeVin(
  vin: string,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<VinDecode | null> {
  if (!isValidVin(vin)) return null;
  try {
    const res = await fetchImpl(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`,
    );
    if (!res.ok) return null;
    const body = await res.json();
    const r = body?.Results?.[0];
    if (!r) return null;
    const decoded = parseDecode(r);
    // A real decode at least resolves make + model; otherwise treat as a miss.
    return decoded.make && decoded.model ? decoded : null;
  } catch {
    return null;
  }
}

/** Batch-decode up to 50 VINs per request via vPIC DecodeVINValuesBatch — ~30 calls for thousands of
 *  VINs instead of one-at-a-time. Returns a VIN→decode map (only entries that resolved make+model). */
export async function decodeVinBatch(
  vins: string[],
): Promise<Map<string, VinDecode>> {
  const out = new Map<string, VinDecode>();
  const valid = Array.from(new Set(vins.filter((v) => isValidVin(v)).map((v) => v.toUpperCase())));
  for (let i = 0; i < valid.length; i += 50) {
    const chunk = valid.slice(i, i + 50);
    try {
      const res = await fetch(
        "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ format: "json", data: chunk.join(";") }).toString(),
        },
      );
      if (!res.ok) continue;
      const body = await res.json();
      for (const r of body?.Results || []) {
        const d = parseDecode(r);
        const vin = strOrNull(r?.VIN);
        if (vin && d.make && d.model) out.set(vin.toUpperCase(), d);
      }
    } catch {
      /* skip the chunk on failure */
    }
  }
  return out;
}

export interface SafetyRating {
  overall: number | null;
  frontal: number | null;
  side: number | null;
  rollover: number | null;
}

function star(v: any): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

/** Parse an NHTSA SafetyRatings VehicleId result into star ratings (1-5, null when not rated). */
export function parseSafety(r: any): SafetyRating {
  return {
    overall: star(r?.OverallRating),
    frontal: star(r?.OverallFrontCrashRating),
    side: star(r?.OverallSideCrashRating),
    rollover: star(r?.RolloverRating),
  };
}

/** NHTSA crash-test star ratings for a make/model/year (2-step lookup). Null on failure/unrated. */
export async function getSafetyRating(
  make: string,
  model: string,
  year: number,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<SafetyRating | null> {
  if (!make || !model || !year) return null;
  try {
    const res1 = await fetchImpl(
      `https://api.nhtsa.gov/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`,
    );
    if (!res1.ok) return null;
    const id = (await res1.json())?.Results?.[0]?.VehicleId;
    if (!id) return null;
    const res2 = await fetchImpl(
      `https://api.nhtsa.gov/SafetyRatings/VehicleId/${id}`,
    );
    if (!res2.ok) return null;
    const r = (await res2.json())?.Results?.[0];
    if (!r) return null;
    const s = parseSafety(r);
    return s.overall || s.frontal || s.side || s.rollover ? s : null;
  } catch {
    return null;
  }
}

/** Open recall count for a make/model/year via NHTSA Recalls. Returns null on failure. */
export async function getRecallCount(
  make: string,
  model: string,
  year: number,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
): Promise<number | null> {
  if (!make || !model || !year) return null;
  try {
    const res = await fetchImpl(
      `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${year}`,
    );
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.Count === "number" ? body.Count : null;
  } catch {
    return null;
  }
}
