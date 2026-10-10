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
) {
  const text = String(condition || "")
    .trim()
    .toLowerCase();
  const damage = String(damageType || "")
    .trim()
    .toLowerCase();
  return (
    REPAIR_CONDITION_TERMS.some((term) => text.includes(term)) ||
    !NO_DAMAGE_VALUES.includes(damage)
  );
}

export function includesRepairable(
  scope?: { includeRepairable?: boolean; buyerMode?: string } | null,
) {
  return typeof scope?.includeRepairable === "boolean"
    ? scope.includeRepairable
    : !!scope?.buyerMode && scope.buyerMode !== "personal";
}
