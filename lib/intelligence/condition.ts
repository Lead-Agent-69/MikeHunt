// lib/intelligence/condition.ts
//
// Operability/condition intelligence for a vehicle — the "good running vs needs work" read a flipper makes
// first. Distinct from TITLE (clean/salvage/rebuilt): a salvage-title car can still RUN & DRIVE, and a
// clean-title car can be a non-runner. We normalize the scraped `condition` + `damage_type` into one
// honest, glanceable signal with a risk tier, so the card/detail can say "Runs & drives" or "Needs work
// · Front end" instead of leaving the buyer to guess what an auction lot actually is.

export type ConditionTier = "good" | "caution" | "risk";

export interface ConditionRead {
  /** Short, buyer-facing label. */
  label: string;
  tier: ConditionTier;
  /** Does it run/drive? */
  runs: "yes" | "no" | "unknown";
  /** Optional specifics (e.g. the damage area) to append. */
  detail?: string;
}

// Title-cased damage area for display ("FRONT END" → "Front end").
function prettyDamage(d?: string): string | undefined {
  if (!d) return undefined;
  const t = d.trim();
  if (!t || /^(repairable|n\/?a|none|unknown)$/i.test(t)) return undefined;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Read a vehicle's operability from its (lowercased) condition + raw damage_type. Pure. The condition
 * keys mirror what the scrapers emit (run_drive, repairable, clean_title, salvage_title, parts_only,
 * flood, hail, rebuilt_title, …).
 */
export function readCondition(
  condition?: string | null,
  damageType?: string | null,
): ConditionRead | null {
  const c = (condition || "").toLowerCase().trim();
  const dmg = prettyDamage(damageType || undefined);
  if (!c && !dmg) return null;

  // Hard operability flags first.
  if (/parts[_ ]?only|parts$/.test(c))
    return { label: "Parts only", tier: "risk", runs: "no" };
  if (
    /non[-_ ]?run|not run|no start|doesn'?t run|engine start(s)? only|starts only/.test(
      c,
    )
  )
    return { label: "Non-runner", tier: "risk", runs: "no", detail: dmg };
  if (/flood|water/.test(c))
    return {
      label: "Flood damage",
      tier: "risk",
      runs: "unknown",
      detail: dmg,
    };

  if (/run[_ ]?drive|runs?\s*&?\s*drives?|run and drive/.test(c))
    return { label: "Runs & drives", tier: "good", runs: "yes", detail: dmg };

  if (/salvage/.test(c))
    return { label: "Salvage", tier: "risk", runs: "unknown", detail: dmg };
  if (/rebuilt/.test(c))
    return {
      label: "Rebuilt title",
      tier: "caution",
      runs: "unknown",
      detail: dmg,
    };
  if (/hail/.test(c))
    return { label: "Hail (cosmetic)", tier: "caution", runs: "yes" };
  if (/repairable|fixer|damaged|needs/.test(c))
    return {
      label: "Needs work",
      tier: "caution",
      runs: "unknown",
      detail: dmg,
    };
  if (/certified|cpo/.test(c))
    return { label: "Certified", tier: "good", runs: "yes" };
  if (/clean/.test(c))
    return { label: "Clean title", tier: "good", runs: "unknown", detail: dmg };

  // Unknown condition but we do know there's damage → caution.
  if (dmg)
    return {
      label: "Needs work",
      tier: "caution",
      runs: "unknown",
      detail: dmg,
    };
  return null;
}

export const CONDITION_TIER_COLOR: Record<ConditionTier, string> = {
  good: "var(--green)",
  caution: "var(--amber)",
  risk: "var(--red)",
};
