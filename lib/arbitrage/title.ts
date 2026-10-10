// lib/arbitrage/title.ts
// Title categories for resale comps.
//
// Listing rows (deals.condition enum) delegate to Amy's lib/deals/title-category.ts, the single
// mapping the badge, the scan filter and this engine share:
//   clean_title → Clean · rebuilt_title → Rebuilt · salvage_title + parts_only → Salvage ·
//   repairable → Rebuildable · run_drive / hail / flood / fire / null → Unknown.
// The engine's labels are the capitalized form of that module's categories.
//
// Free text (sold_listings.title is the source listing HEADLINE, not a title document; title-category
// deliberately never reads text) goes through soldTitleCategory: only an explicit clean-title claim
// is Clean (market-value soldTitleLane, which rejects "not clean title"); branded keywords map to
// the most conservative branded category (salvage/parts before rebuilt: "rebuilt from salvage" is
// Salvage). Everything else stays Unknown.

import {
  LISTING_CONDITIONS,
  titleCategory as dealTitleCategory,
  type TitleCategory as DealTitleCategory,
} from "@/lib/deals/title-category";
import { soldTitleLane } from "@/lib/scoring/market-value";

export type TitleCategory =
  | "Clean"
  | "Rebuilt"
  | "Salvage"
  | "Rebuildable"
  | "Unknown";

const LABEL: Readonly<Record<DealTitleCategory, TitleCategory>> = {
  clean: "Clean",
  rebuilt: "Rebuilt",
  salvage: "Salvage",
  rebuildable: "Rebuildable",
  unknown: "Unknown",
};

/** Category for a free-text title (sold-comp headline, legacy free-text condition). */
export function soldTitleCategory(text?: string | null): TitleCategory {
  const raw = String(text || "").trim();
  const c = raw.toLowerCase();
  if (!c) return "Unknown";
  if (/salvage|parts/.test(c)) return "Salvage";
  if (/rebuilt|rebuild\b/.test(c)) return "Rebuilt";
  if (/repairable|rebuildable/.test(c)) return "Rebuildable";
  // Other branded words (flood, junk, wrecked, certificate of destruction…) → conservative Salvage.
  if (soldTitleLane(raw) === "salvage") return "Salvage";
  if (c === "clean" || soldTitleLane(raw) === "clean") return "Clean";
  return "Unknown";
}

export function titleCategory(condition?: string | null): TitleCategory {
  const c = String(condition || "")
    .trim()
    .toLowerCase();
  if (!c) return "Unknown";
  if ((LISTING_CONDITIONS as readonly string[]).includes(c))
    return LABEL[dealTitleCategory({ condition: c })];
  return soldTitleCategory(condition);
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
