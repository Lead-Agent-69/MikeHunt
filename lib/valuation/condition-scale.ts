// lib/valuation/condition-scale.ts
// Condition grade (excellent / good / fair) and damage severity (none / minor / moderate / severe /
// parts) derived from the fields listings already carry (damage_type, condition, title text), each
// mapped to a price factor vs a clean, typical-condition comp.
//
// HEURISTIC, documented in docs/valuation/repair-and-condition.md:
//   • Severity factors MIRROR lib/scoring/condition-value.ts SEVERITY_RULES (the multipliers already
//     used in production): parts-only 0.20, fire 0.30, flood 0.38, collision/"damaged" 0.58,
//     hail 0.85. We add no new severity numbers; we only group them into a five-step scale.
//   • Grade factors are relative to "good" = 1.0 (a typical comp). excellent 1.05 mirrors the
//     certified/CPO uplift in condition-value; fair 0.90 is a round-number heuristic.
//   • Title brands (salvage / rebuilt) are NOT handled here: the arbitrage engine values branded
//     titles on same-title comps or TITLE_DISCOUNT. Do not stack this factor on top of
//     condition-value titleSeverityMultiplier, which already includes these damage numbers.

export type DamageSeverity =
  | "none"
  | "minor"
  | "moderate"
  | "severe"
  | "parts"
  | "unknown";
export type ConditionGrade = "excellent" | "good" | "fair" | "unknown";

export interface ConditionInput {
  damageType?: string | null;
  condition?: string | null;
  /** Free-text title/headline; scanned for damage words only. */
  title?: string | null;
}

export interface ConditionScale {
  severity: DamageSeverity;
  severityTag: string;
  grade: ConditionGrade;
  /** Severity factor × grade factor (grade ignored at moderate and worse). 1 when unknown. */
  factor: number;
  severityFactor: number;
  gradeFactor: number;
  heuristic: true;
}

/** Mirrors condition-value.ts SEVERITY_RULES multipliers. */
export const SEVERITY_FACTOR: Readonly<Record<DamageSeverity, number>> = {
  none: 1,
  minor: 0.85,
  moderate: 0.58,
  severe: 0.38,
  parts: 0.2,
  unknown: 1,
};
/** Fire is worse than flood in condition-value (0.30 vs 0.38). */
export const FIRE_FACTOR = 0.3;

export const GRADE_FACTOR: Readonly<Record<ConditionGrade, number>> = {
  excellent: 1.05,
  good: 1,
  fair: 0.9,
  unknown: 1,
};

const RULES: Array<[RegExp, DamageSeverity, string]> = [
  [
    /\bparts?\b|parts only|non[-\s]?running|no engine|shell only|stripped|for parts/,
    "parts",
    "parts-only",
  ],
  [/\bfire\b|\bburn(t|ed)?\b/, "severe", "fire"],
  [/flood|water/, "severe", "flood"],
  [
    /frame|structural|roll[-\s]?over|\broll\b|all over|total/,
    "severe",
    "structural",
  ],
  [
    /front|rear|\bside\b|collision|accident|wreck|repairable|undercarriage|mechanical|engine|transmission/,
    "moderate",
    "collision/mechanical",
  ],
  [/hail|scratch|dent|minor|cosmetic|vandal|scuff/, "minor", "cosmetic"],
];

function lc(v?: string | null) {
  return String(v || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .trim();
}

export function damageSeverity(input: ConditionInput): {
  severity: DamageSeverity;
  tag: string;
} {
  const dmg = lc(input.damageType);
  // Title/condition words like "clean title" or "salvage title" are brands, not damage; strip them.
  const cond = lc(input.condition).replace(
    /\b(clean|salvage|rebuilt|rebuildable|branded)\s+title\b/g,
    " ",
  );
  const hay = `${dmg} ${cond} ${lc(input.title)}`;
  for (const [rx, sev, tag] of RULES)
    if (rx.test(hay)) return { severity: sev, tag };
  if (dmg === "none" || /normal wear|no damage/.test(hay))
    return { severity: "none", tag: "none reported" };
  if (dmg || cond) return { severity: "none", tag: "no damage words" };
  return { severity: "unknown", tag: "no damage or condition fields" };
}

export function conditionGrade(condition?: string | null): ConditionGrade {
  const c = lc(condition);
  if (!c) return "unknown";
  if (/excellent|like new|mint|pristine|certified|\bcpo\b/.test(c))
    return "excellent";
  if (/\bfair\b|\bpoor\b|rough|worn|needs work/.test(c)) return "fair";
  if (/very good|\bgood\b|clean(?!\s+title)|\bused\b/.test(c)) return "good";
  return "unknown";
}

export function conditionScale(input: ConditionInput): ConditionScale {
  const { severity, tag } = damageSeverity(input);
  const grade = conditionGrade(input.condition);
  const severityFactor =
    tag === "fire" ? FIRE_FACTOR : SEVERITY_FACTOR[severity];
  const gradeApplies =
    severity === "none" || severity === "minor" || severity === "unknown";
  const gradeFactor = gradeApplies ? GRADE_FACTOR[grade] : 1;
  return {
    severity,
    severityTag: tag,
    grade,
    factor: Math.round(severityFactor * gradeFactor * 1000) / 1000,
    severityFactor,
    gradeFactor,
    heuristic: true,
  };
}
