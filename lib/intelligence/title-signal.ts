// One cautious read of "what does the title badge say" for every card + the deal page.
// A listing can tag itself clean_title while its condition/damage fields (or the
// decision guard) say repairable/salvage. Showing "Clean title reported" next to a
// "Repairable vehicle" warning contradicts itself, so the cautious signal wins.
import { REPAIR_CONDITION_TERMS } from "./repair-risk";

export const TITLE_UNCONFIRMED_LABEL = "Title unconfirmed";

/**
 * True when condition/damage text names a repair term (salvage, flood, damage…).
 * Uses the decision guard's term list; a bare damage value like "used" is not
 * enough on cards. The deal page also passes the guard verdict itself.
 */
export function hasRepairableSignal(
  condition?: string | null,
  damageType?: string | null,
): boolean {
  const text = `${condition || ""} ${damageType || ""}`.toLowerCase();
  return REPAIR_CONDITION_TERMS.some((term) => text.includes(term));
}

/** True when a raw title value claims clean. */
export function claimsCleanTitle(title?: string | null): boolean {
  return /^clean([_ ]title)?$/i.test(String(title || "").trim());
}

/**
 * Should a "clean title" claim be downgraded to "Title unconfirmed"?
 * `repairableEvidence` lets callers pass the decision-guard verdict too.
 */
export function cleanTitleConflicts(
  title: string | null | undefined,
  opts: {
    condition?: string | null;
    damageType?: string | null;
    repairableEvidence?: boolean;
  },
): boolean {
  if (!claimsCleanTitle(title)) return false;
  return (
    Boolean(opts.repairableEvidence) ||
    hasRepairableSignal(opts.condition, opts.damageType)
  );
}
