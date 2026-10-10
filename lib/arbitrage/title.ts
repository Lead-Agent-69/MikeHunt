// lib/arbitrage/title.ts
// Title categories for resale comps.
//
// TODO(arbitrage-v2): swap this local adapter for Amy's lib/deals/title-category.ts once it lands on
// main. The mapping here is the same contract:
//   clean_title → Clean · rebuilt_title → Rebuilt · salvage_title + parts_only → Salvage ·
//   repairable → Rebuildable · anything else → Unknown.
// Free-text conditions ("SALVAGE CERTIFICATE", "rebuildable") are matched by keyword in the same
// order as lib/discovery/categorize titleClass (salvage/parts before rebuilt: "rebuilt from salvage"
// is treated as Salvage, the conservative side).

import {
  LISTING_CONDITIONS,
  soldTitleCategory,
  titleCategory as dealsTitleCategory,
  type TitleCategory as DealsTitleCategory,
} from "@/lib/deals/title-category";

export type TitleCategory =
  | "Clean"
  | "Rebuilt"
  | "Salvage"
  | "Rebuildable"
  | "Unknown";

export function titleCategory(condition?: string | null): TitleCategory {
  const c = String(condition || "").toLowerCase();
  if (!c) return "Unknown";
  if (/salvage|parts/.test(c)) return "Salvage";
  if (/rebuilt/.test(c)) return "Rebuilt";
  if (/repairable|rebuildable/.test(c)) return "Rebuildable";
  if (/clean/.test(c)) return "Clean";
  return "Unknown";
}

// Shared (lib/deals/title-category) bucket → this module's capitalized label.
const FROM_SHARED: Readonly<Record<DealsTitleCategory, TitleCategory>> = {
  clean: "Clean",
  rebuilt: "Rebuilt",
  salvage: "Salvage",
  rebuildable: "Rebuildable",
  unknown: "Unknown",
};

/**
 * Title category for a SOLD comp. Its `title` is the seller's headline, not a condition enum, so it
 * goes through the shared lib/deals/title-category soldTitleCategory: Clean only on an explicit
 * "clean title"; flood/hail/lemon/etc. are branded; a bare headline is Unknown (never Clean).
 * Listing and asking-price comps keep using titleCategory(condition) above.
 */
export function soldCompTitleCategory(headline?: string | null): TitleCategory {
  // A sold row that already carries a listing_condition value (e.g. "salvage_title") uses it as is.
  const exact = String(headline || "")
    .trim()
    .toLowerCase();
  if ((LISTING_CONDITIONS as readonly string[]).includes(exact))
    return FROM_SHARED[dealsTitleCategory({ condition: exact })];
  return FROM_SHARED[soldTitleCategory(headline)];
}

/** Category for any comp: sold rows by headline, asking-price rows by condition. */
export function compTitleCategory(comp: {
  kind?: string | null;
  title?: string | null;
}): TitleCategory {
  return comp.kind === "sold"
    ? soldCompTitleCategory(comp.title)
    : titleCategory(comp.title);
}

export function isBrandedTitle(cat: TitleCategory): boolean {
  return cat === "Rebuilt" || cat === "Salvage" || cat === "Rebuildable";
}

/**
 * Which comp categories may value a listing at face value (no discount):
 *   Salvage      → Salvage comps
 *   Rebuilt      → Rebuilt comps
 *   Rebuildable  → Rebuildable or Salvage comps (both unrepaired branded cars)
 *   Clean        → Clean + Unknown-title comps
 *   Unknown      → Clean + Unknown-title comps (confidence capped at "low")
 * An Unknown-title comp can only be worth LESS than clean (it may be branded), so pooling it under a
 * clean/unknown listing errs low and never invents profit. Branded listings never see clean comps
 * here; that only happens through the flagged discount fallback in engine.ts.
 */
export function compCategoriesFor(
  cat: TitleCategory,
): readonly TitleCategory[] {
  switch (cat) {
    case "Salvage":
      return ["Salvage"];
    case "Rebuilt":
      return ["Rebuilt"];
    case "Rebuildable":
      return ["Rebuildable", "Salvage"];
    default:
      return ["Clean", "Unknown"];
  }
}
