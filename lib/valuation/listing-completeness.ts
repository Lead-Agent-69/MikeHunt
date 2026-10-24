// lib/valuation/listing-completeness.ts
// Per-listing completeness score and the valuation-confidence penalty for missing photos and key
// fields. The audit plan said another worker was adding a per-row completeness score. When this was
// written, neither main nor any open PR had one (only the per-SOURCE rollup in
// app/api/scrape/health/route.ts addCompleteness). So this computes it locally, behind ONE function,
// `completenessFor(row)`, that is easy to swap for the shared score when it lands. Field
// definitions mirror the scrape-health rollup so the two never disagree on what "has a VIN" means.
//
// HEURISTIC (docs/valuation/completeness.md): the field weights and penalty points are round
// numbers chosen so photos dominate (no photos = condition unverifiable) and the penalty is capped
// below the arbitrage engine's own tier/title penalties.

export interface CompletenessRow {
  images?: unknown;
  photoCount?: number | null;
  photo_count?: number | null;
  vin?: string | null;
  mileage?: number | string | null;
  year?: number | string | null;
  make?: string | null;
  model?: string | null;
  condition?: string | null;
  title_type?: string | null;
  titleType?: string | null;
  title_status?: string | null;
  title_source?: string | null;
  title?: string | null;
  damage_type?: string | null;
  damageType?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_zip?: string | null;
  locationState?: string | null;
}

export type CompletenessField =
  | "photos"
  | "vin"
  | "mileage"
  | "year_make_model"
  | "title"
  | "damage"
  | "location";

export interface ListingCompleteness {
  /** 0..1 weighted share of key fields present. */
  score: number;
  photoCount: number;
  missing: CompletenessField[];
  /** "local" until the shared per-row score replaces completenessFor. */
  source: "local" | "shared";
}

/** HEURISTIC weights (sum = 1). Photos are the only way to sanity-check condition remotely. */
export const COMPLETENESS_WEIGHTS: Readonly<Record<CompletenessField, number>> =
  {
    photos: 0.25,
    vin: 0.15,
    mileage: 0.15,
    year_make_model: 0.15,
    title: 0.1,
    damage: 0.1,
    location: 0.1,
  };

/** HEURISTIC penalty points on a 0–100 confidence score (lib/arbitrage CONFIDENCE scale). */
export const COMPLETENESS_PENALTY = {
  noPhotos: 15,
  /** Fewer than this many photos (but at least one). */
  fewPhotosBelow: 4,
  fewPhotos: 5,
  perMissingField: 4,
  max: 25,
} as const;

function present(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return Number.isFinite(value) && value > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function photoCountOf(row: CompletenessRow): number {
  const explicit = Number(row.photoCount ?? row.photo_count);
  if (Number.isFinite(explicit) && explicit >= 0) return Math.floor(explicit);
  if (Array.isArray(row.images))
    return row.images.filter((u) => typeof u === "string" && u.trim()).length;
  return 0;
}

/** Same title signal as the scrape-health rollup, but a source default is not a stated title. */
function hasTitle(row: CompletenessRow): boolean {
  if (row.title_source === "source_default") return false;
  return present(
    row.title_type ||
      row.titleType ||
      row.title_status ||
      row.condition ||
      String(row.title || "").match(/salvage|rebuilt|clean title|parts/i)?.[0],
  );
}

/** Local per-row completeness. Use completenessFor, not this, from callers. */
export function localListingCompleteness(
  row: CompletenessRow,
): ListingCompleteness {
  const photoCount = photoCountOf(row);
  const vin = String(row.vin || "").trim();
  const has: Record<CompletenessField, boolean> = {
    photos: photoCount > 0,
    vin: vin.length === 17,
    mileage: present(Number(row.mileage)),
    year_make_model:
      present(Number(row.year)) && present(row.make) && present(row.model),
    title: hasTitle(row),
    damage: present(row.condition || row.damage_type || row.damageType),
    location:
      present(row.location_city) ||
      present(row.location_state || row.locationState) ||
      present(row.location_zip),
  };
  const missing = (Object.keys(has) as CompletenessField[]).filter(
    (k) => !has[k],
  );
  const score = (Object.keys(has) as CompletenessField[]).reduce(
    (s, k) => s + (has[k] ? COMPLETENESS_WEIGHTS[k] : 0),
    0,
  );
  return {
    score: Math.round(score * 100) / 100,
    photoCount,
    missing,
    source: "local",
  };
}

/**
 * THE swap point. When the shared per-row completeness score lands, map it to
 * ListingCompleteness here (source: "shared"); callers don't change.
 */
export function completenessFor(row: CompletenessRow): ListingCompleteness {
  return localListingCompleteness(row);
}

/** Confidence penalty (points off a 0–100 score) with human-readable reasons. */
export function completenessConfidencePenalty(c: ListingCompleteness): {
  points: number;
  reasons: string[];
} {
  const P = COMPLETENESS_PENALTY;
  let points = 0;
  const reasons: string[] = [];
  if (c.photoCount === 0) {
    points += P.noPhotos;
    reasons.push(`no photos (−${P.noPhotos})`);
  } else if (c.photoCount < P.fewPhotosBelow) {
    points += P.fewPhotos;
    reasons.push(
      `only ${c.photoCount} photo${c.photoCount === 1 ? "" : "s"} (−${P.fewPhotos})`,
    );
  }
  const fields = c.missing.filter((m) => m !== "photos");
  if (fields.length) {
    const pts = fields.length * P.perMissingField;
    points += pts;
    reasons.push(`missing ${fields.join(", ").replace(/_/g, "/")} (−${pts})`);
  }
  if (points > P.max) {
    reasons.push(`completeness penalty capped at ${P.max}`);
    points = P.max;
  }
  return { points, reasons };
}
