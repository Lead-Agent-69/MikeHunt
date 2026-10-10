// Free authoritative vehicle data — NHTSA vPIC (VIN decode) + NHTSA Recalls. No API key;
// traffic controls still apply. Pure parsers (testable) + best-effort fetchers. Decode is immutable per
// VIN; recalls change over time. Callers cache results in the vin_decodes table.

import { isValidVin } from "./vin";
import { callSignal, type UpstreamOpts } from "./deadline";

type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
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
      { signal: callSignal() },
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
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Map<string, VinDecode>> {
  const out = new Map<string, VinDecode>();
  const valid = Array.from(
    new Set(vins.map((v) => v.trim().toUpperCase()).filter(isValidVin)),
  );
  for (let i = 0; i < valid.length; i += 50) {
    const chunk = valid.slice(i, i + 50);
    try {
      const res = await fetchImpl(
        "https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/",
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            format: "json",
            data: chunk.join(";"),
          }).toString(),
        },
      );
      if (!res.ok) continue;
      const body = await res.json();
      const requested = new Set(chunk);
      for (const r of Array.isArray(body?.Results) ? body.Results : []) {
        const d = parseDecode(r);
        const vin = strOrNull(r?.VIN);
        const normalizedVin = vin?.toUpperCase();
        // A response must resolve a requested VIN, not silently inject unrelated records.
        if (normalizedVin && requested.has(normalizedVin) && d.make && d.model)
          out.set(normalizedVin, d);
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
  opts: UpstreamOpts = {},
): Promise<SafetyRating | null> {
  if (!make || !model || !year) return null;
  const { deadline } = opts;
  try {
    if (deadline?.expired()) return null;
    const res1 = await fetchImpl(
      `https://api.nhtsa.gov/SafetyRatings/modelyear/${year}/make/${encodeURIComponent(make)}/model/${encodeURIComponent(model)}`,
      { signal: callSignal(deadline) },
    );
    if (!res1.ok) return null;
    const id = (await res1.json())?.Results?.[0]?.VehicleId;
    if (!id) return null;
    if (deadline?.expired()) return null;
    const res2 = await fetchImpl(
      `https://api.nhtsa.gov/SafetyRatings/VehicleId/${id}`,
      { signal: callSignal(deadline) },
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

// ---------------------------------------------------------------------------------------------
// Extended decode (DecodeVinValuesExtended): the same flat shape as DecodeVinValues plus the
// NCSA body/make/model fields. Adds series, engine, transmission, GVWR and full plant location.

export interface VinDecodeExtended extends VinDecode {
  series: string | null;
  doors: number | null;
  vehicleType: string | null;
  manufacturer: string | null;
  engineConfiguration: string | null;
  engineHp: number | null;
  engineModel: string | null;
  /** Human engine label built only from decoded parts, e.g. "6.7L V8 Diesel 440hp". */
  engine: string | null;
  transmissionStyle: string | null;
  transmissionSpeeds: number | null;
  /** NHTSA GVWR class text, e.g. "Class 2H: 9,001 - 10,000 lb (4,082 - 4,536 kg)". */
  gvwr: string | null;
  /** Upper bound of the GVWR class in lb (null when vPIC gives no class or "or less" ranges only). */
  gvwrMaxLb: number | null;
  plantCompany: string | null;
  plantCity: string | null;
  plantState: string | null;
  /** vPIC ErrorCode; "0" is a clean decode. Non-zero codes (e.g. "1" bad check digit) still return
   *  partial data, so callers should show it as unconfirmed rather than drop it. */
  decodeErrorCode: string | null;
  decodeErrorText: string | null;
  decodeClean: boolean;
}

function gvwrUpperLb(gvwr: string | null): number | null {
  if (!gvwr) return null;
  // "Class 2H: 9,001 - 10,000 lb (...)" -> 10000; "Class 1: 6,000 lb or less (...)" -> 6000
  const m = gvwr.match(/:\s*(?:[\d,]+\s*-\s*)?([\d,]+)\s*lb/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse a DecodeVinValuesExtended Results[0] object. Superset of parseDecode. */
export function parseDecodeExtended(r: any): VinDecodeExtended {
  const base = parseDecode(r);
  const cyl = base.cylinders;
  const disp = base.displacementL;
  const config = strOrNull(r?.EngineConfiguration);
  const hp = numOrNull(r?.EngineHP);
  const configShort = config
    ? config.replace(/^V-Shaped$/i, "V").replace(/^In-Line$/i, "I")
    : null;
  const engineParts = [
    disp != null ? `${disp.toFixed(1)}L` : null,
    cyl != null
      ? configShort === "V" || configShort === "I"
        ? `${configShort}${cyl}`
        : `${cyl} cyl`
      : null,
    base.fuelType && !/^gasoline$/i.test(base.fuelType) ? base.fuelType : null,
    hp != null ? `${Math.round(hp)}hp` : null,
  ].filter(Boolean);
  const errorCode = strOrNull(r?.ErrorCode);
  const gvwr = strOrNull(r?.GVWR);
  return {
    ...base,
    trim: strOrNull(r?.Trim),
    series: strOrNull(r?.Series),
    doors: numOrNull(r?.Doors),
    vehicleType: strOrNull(r?.VehicleType),
    manufacturer: strOrNull(r?.Manufacturer),
    engineConfiguration: config,
    engineHp: hp,
    engineModel: strOrNull(r?.EngineModel),
    engine: engineParts.length ? engineParts.join(" ") : null,
    transmissionStyle: strOrNull(r?.TransmissionStyle),
    transmissionSpeeds: numOrNull(r?.TransmissionSpeeds),
    gvwr,
    gvwrMaxLb: gvwrUpperLb(gvwr),
    plantCompany: strOrNull(r?.PlantCompanyName),
    plantCity: strOrNull(r?.PlantCity),
    plantState: strOrNull(r?.PlantState),
    decodeErrorCode: errorCode,
    decodeErrorText: strOrNull(r?.ErrorText),
    decodeClean: errorCode === "0",
  };
}

/** Full decode via vPIC DecodeVinValuesExtended. Null for invalid VINs, failures, or no make/model. */
export async function decodeVinExtended(
  vin: string,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  opts: UpstreamOpts = {},
): Promise<VinDecodeExtended | null> {
  if (!isValidVin(vin)) return null;
  if (opts.deadline?.expired()) return null;
  try {
    const res = await fetchImpl(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
      { signal: callSignal(opts.deadline) },
    );
    if (!res.ok) return null;
    const r = (await res.json())?.Results?.[0];
    if (!r) return null;
    const d = parseDecodeExtended(r);
    return d.make && d.model ? d : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Recalls. NHTSA has no public VIN-level recall API: api.nhtsa.gov/recalls/recallsByVin (and
// recallsByVIN) return 403 "Missing Authentication Token" (no such route); VIN-specific open-recall
// status is only on nhtsa.gov/recalls and manufacturer sites. Public endpoints are by
// make/model/year and by campaign number.
//
// vPIC model names don't always match the recalls catalog: vPIC says "F-250" while recalls file
// 2016 Super Duty campaigns under "F-250 SD"; querying "F-250" returns Count 0 (a false zero). So we
// resolve names through the recalls catalog (products/vehicle/models) first and union every
// catalog model that is the decoded model or starts with it.

export interface RecallCampaign {
  campaign: string;
  component: string | null;
  reportReceived: string | null;
  parkIt: boolean;
  parkOutside: boolean;
  overTheAir: boolean;
  model: string | null;
}

export interface RecallLookup {
  count: number;
  campaigns: RecallCampaign[];
  /** Catalog model names that were queried (for transparency in the UI). */
  modelsQueried: string[];
  /** "model_year": these are recalls filed for the make/model/year family, not confirmed for this VIN. */
  scope: "model_year";
}

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

/** Pick recalls-catalog model names that belong to a vPIC model ("F-250" -> "F-250 SD", "F-250
 *  SUPERCAB", ...). Matches the exact name or the name followed by a space; never "F-2500". */
export function recallModelCandidates(
  catalog: Array<{ model?: string }> | null | undefined,
  model: string,
): string[] {
  const want = norm(model);
  const out = new Set<string>();
  for (const row of catalog ?? []) {
    const m = row?.model ? norm(String(row.model)) : "";
    if (m === want || m.startsWith(want + " ")) out.add(m);
  }
  return Array.from(out);
}

export function parseRecallResults(
  body: any,
  model: string | null = null,
): RecallCampaign[] {
  const rows = Array.isArray(body?.results) ? body.results : [];
  return rows
    .filter((r: any) => strOrNull(r?.NHTSACampaignNumber))
    .map((r: any) => ({
      campaign: String(r.NHTSACampaignNumber).trim(),
      component: strOrNull(r?.Component),
      reportReceived: strOrNull(r?.ReportReceivedDate),
      parkIt: r?.parkIt === true,
      parkOutside: r?.parkOutSide === true,
      overTheAir: r?.overTheAirUpdate === true,
      model: strOrNull(r?.Model) ?? model,
    }));
}

/** Recalls for a make/model/year family, resolved through the recalls catalog. Null on failure. */
export async function getRecalls(
  make: string,
  model: string,
  year: number,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  opts: UpstreamOpts = {},
): Promise<RecallLookup | null> {
  if (!make || !model || !year) return null;
  const { deadline } = opts;
  if (deadline?.expired()) return null;
  const byModel = (m: string) =>
    `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(m)}&modelYear=${year}`;
  try {
    let models: string[] = [];
    try {
      const cat = await fetchImpl(
        `https://api.nhtsa.gov/products/vehicle/models?modelYear=${year}&make=${encodeURIComponent(make)}&issueType=r`,
        { signal: callSignal(deadline) },
      );
      if (cat.ok) {
        const body = await cat.json();
        if (Array.isArray(body?.results))
          models = recallModelCandidates(body.results, model).slice(0, 12);
      }
    } catch {
      /* catalog is an optimisation; fall back to the decoded name */
    }
    if (!models.includes(norm(model))) models.unshift(norm(model));

    const seen = new Map<string, RecallCampaign>();
    let anyOk = false;
    for (const m of models) {
      // Out of time: a partial union could under-count, so report unknown rather than a low number.
      if (deadline?.expired()) return null;
      const res = await fetchImpl(byModel(m), { signal: callSignal(deadline) });
      if (!res.ok) continue;
      const body = await res.json();
      if (typeof body?.Count !== "number" && !Array.isArray(body?.results))
        continue;
      anyOk = true;
      for (const c of parseRecallResults(body, m))
        if (!seen.has(c.campaign)) seen.set(c.campaign, c);
      // Bodies without a results array still carry Count (older mocks / trimmed payloads).
      if (!Array.isArray(body?.results) && typeof body?.Count === "number")
        return {
          count: body.Count,
          campaigns: [],
          modelsQueried: models,
          scope: "model_year",
        };
    }
    if (!anyOk) return null;
    const campaigns = Array.from(seen.values());
    return {
      count: campaigns.length,
      campaigns,
      modelsQueried: models,
      scope: "model_year",
    };
  } catch {
    return null;
  }
}

/** Recall count for a make/model/year family (see getRecalls). Returns null on failure. */
export async function getRecallCount(
  make: string,
  model: string,
  year: number,
  fetchImpl: FetchLike = globalThis.fetch as unknown as FetchLike,
  opts: UpstreamOpts = {},
): Promise<number | null> {
  const r = await getRecalls(make, model, year, fetchImpl, opts);
  return r ? r.count : null;
}
