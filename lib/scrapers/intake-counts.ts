/** Intake observations, not distinct vehicles. Renewals are included in notUpserted. */
export interface ScrapeIntakeCounts {
  received: number;
  normalized: number;
  scopeMatched: number;
  qualityEligible: number;
  vehicleEligible: number;
  fieldEligible: number;
  photoEligible: number;
  persisted: number;
  renewed: number;
  notUpserted: number;
}

const keys = [
  "received",
  "normalized",
  "scopeMatched",
  "qualityEligible",
  "vehicleEligible",
  "fieldEligible",
  "photoEligible",
  "persisted",
  "renewed",
  "notUpserted",
] as const;

/** Allowlist counts only. Missing/invalid receipts remain unknown, never fabricated zeros. */
export function parseIntakeCounts(
  value: unknown,
): ScrapeIntakeCounts | undefined {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const input = value as Record<string, unknown>;
  if (
    keys.some(
      (key) => !Number.isSafeInteger(input[key]) || Number(input[key]) < 0,
    )
  )
    return undefined;
  const result = Object.fromEntries(
    keys.map((key) => [key, input[key]]),
  ) as unknown as ScrapeIntakeCounts;
  const stages = keys.slice(0, 8).map((key) => result[key]);
  if (
    stages.some((count, index) => index > 0 && count > stages[index - 1]) ||
    result.notUpserted !== result.photoEligible - result.persisted ||
    result.renewed > result.notUpserted
  )
    return undefined;
  return result;
}

export function sumIntakeCounts(a: ScrapeIntakeCounts, b: ScrapeIntakeCounts) {
  return parseIntakeCounts(
    Object.fromEntries(keys.map((key) => [key, a[key] + b[key]])),
  );
}
