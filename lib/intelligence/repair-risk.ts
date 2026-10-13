// Reported repair risk is independent of title status and is not a damage diagnosis.
export const REPAIR_CONDITION_TERMS = [
  "salvage",
  "rebuilt",
  "parts",
  "flood",
  "fire",
  "junk",
  "wreck",
  "repairable",
  "non-run",
  "non_run",
  "non run",
  "not running",
  "mechanic special",
  "hail",
  "damage",
];
export const NO_DAMAGE_VALUES = [
  "",
  "none",
  "unknown",
  "n/a",
  "na",
  "not reported",
  "no damage",
];

export function hasReportedRepairRisk(
  condition?: string | null,
  damageType?: string | null,
  title?: string | null,
) {
  const text = String(condition || "")
    .trim()
    .toLowerCase();
  const damage = String(damageType || "")
    .trim()
    .toLowerCase();
  return (
    REPAIR_CONDITION_TERMS.some((term) => text.includes(term)) ||
    !NO_DAMAGE_VALUES.includes(damage) ||
    hasTitleReportedRepairRisk(title)
  );
}

/** Explicit seller wording is a screening signal, not an inspection or damage estimate. */
export const REPORTED_REPAIR_TITLE_PATTERN =
  "mechanic(?:['\u2019]s|s)?[\\s-]+special|(?:restoration|repair)[\\s-]+project|parts[\\s-]+only|non[\\s-]+runner|not[\\s-]+running|does(?:n't|[\\s]+not)[\\s]+run|needs[\\s]+(?:repairs?|(?:an?[\\s]+)?(?:engine|transmission))";

export function hasTitleReportedRepairRisk(title?: string | null) {
  const text = String(title || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'");
  return new RegExp(`\\b(?:${REPORTED_REPAIR_TITLE_PATTERN})\\b`, "i").test(
    text,
  );
}

export function includesRepairable(
  scope?: { includeRepairable?: boolean; buyerMode?: string } | null,
) {
  return typeof scope?.includeRepairable === "boolean"
    ? scope.includeRepairable
    : !!scope?.buyerMode && scope.buyerMode !== "personal";
}
