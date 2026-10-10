// Title category: the buyer-facing title bucket for a listing, derived ONLY from the
// `deals.condition` enum (listing_condition). `deals` has no title column, and `condition`
// mixes title, operability and damage, so this is the one place that maps it.
//
// Pure and dependency-free on purpose: server routes (/api/scan, /api/scan/facets,
// /api/discover, /api/deals, /api/deals/map) filter with it, and the client (TitleBadge, filter
// chips) can import the same mapping so the badge and the filter never disagree.
//
//   Clean       = clean_title
//   Rebuilt     = rebuilt_title
//   Salvage     = salvage_title, parts_only (parts_only carries a "parts only" sub-chip)
//   Rebuildable = repairable
//   Unknown     = run_drive, hail, flood, fire, null (hail/flood/fire carry a damage chip)
//
// Unknown stays unknown: run_drive is an operability claim (and the pipeline's default for
// rows with no stated condition), not a clean title. Listing-title text ("Clean Carfax") is
// never read.

export const TITLE_CATEGORIES = [
  "clean",
  "rebuilt",
  "salvage",
  "rebuildable",
  "unknown",
] as const;

export type TitleCategory = (typeof TITLE_CATEGORIES)[number];

/** The listing_condition enum values (supabase/migrations, types/supabase.ts). */
export const LISTING_CONDITIONS = [
  "run_drive",
  "repairable",
  "parts_only",
  "clean_title",
  "rebuilt_title",
  "salvage_title",
  "flood",
  "fire",
  "hail",
] as const;

export type ListingCondition = (typeof LISTING_CONDITIONS)[number];

export const TITLE_CATEGORY_CONDITIONS: Readonly<
  Record<TitleCategory, readonly ListingCondition[]>
> = {
  clean: ["clean_title"],
  rebuilt: ["rebuilt_title"],
  salvage: ["salvage_title", "parts_only"],
  rebuildable: ["repairable"],
  unknown: ["run_drive", "hail", "flood", "fire"],
};

export const TITLE_CATEGORY_LABELS: Readonly<Record<TitleCategory, string>> = {
  clean: "Clean title",
  rebuilt: "Rebuilt title",
  salvage: "Salvage title",
  rebuildable: "Rebuildable",
  unknown: "Title unknown",
};

export type TitleDamageChip = "hail" | "flood" | "fire";

export type TitleCategoryDetail = {
  category: TitleCategory;
  /** The raw enum value when it is one, else null. */
  condition: ListingCondition | null;
  /** Salvage sub-chip: the listing is sold for parts. */
  partsOnly: boolean;
  /** Unknown-title damage chip (the enum value is damage, not title). */
  damage: TitleDamageChip | null;
};

type TitleRow = { condition?: string | null } | null | undefined;

const CONDITION_TO_CATEGORY: Readonly<Record<string, TitleCategory>> =
  Object.fromEntries(
    TITLE_CATEGORIES.flatMap((category) =>
      TITLE_CATEGORY_CONDITIONS[category].map((c) => [c, category]),
    ),
  );

function normalizeCondition(value: unknown): ListingCondition | null {
  const c = String(value ?? "")
    .trim()
    .toLowerCase();
  return (LISTING_CONDITIONS as readonly string[]).includes(c)
    ? (c as ListingCondition)
    : null;
}

/** Title bucket for a deals row (or anything with a `condition`). Unmapped/null → "unknown". */
export function titleCategory(row: TitleRow): TitleCategory {
  const condition = normalizeCondition(row?.condition);
  return (condition && CONDITION_TO_CATEGORY[condition]) || "unknown";
}

/** Category plus the sub-chips the badge shows (parts only, hail/flood/fire). */
export function titleCategoryDetail(row: TitleRow): TitleCategoryDetail {
  const condition = normalizeCondition(row?.condition);
  return {
    category: titleCategory(row),
    condition,
    partsOnly: condition === "parts_only",
    damage:
      condition === "hail" || condition === "flood" || condition === "fire"
        ? condition
        : null,
  };
}

export function isTitleCategory(value: unknown): value is TitleCategory {
  return (TITLE_CATEGORIES as readonly string[]).includes(String(value));
}

/** True when the row falls in any of `categories`; an empty list matches everything. */
export function matchesTitleCategories(
  row: TitleRow,
  categories: readonly TitleCategory[],
): boolean {
  if (!categories.length) return true;
  return categories.includes(titleCategory(row));
}

/**
 * Enum values (and whether NULL is included) for a set of categories. "unknown" is the only
 * category that includes NULL condition rows.
 */
export function conditionsFor(categories: readonly TitleCategory[]): {
  conditions: ListingCondition[];
  includeNull: boolean;
} {
  const wanted = Array.from(new Set(categories.filter(isTitleCategory)));
  const conditions = LISTING_CONDITIONS.filter((c) =>
    wanted.includes(CONDITION_TO_CATEGORY[c]),
  );
  return { conditions, includeNull: wanted.includes("unknown") };
}

// Accepted aliases, so older links (`titleType=salvage_title`, `repairable`) keep working.
const TITLE_TYPE_ALIASES: Readonly<Record<string, TitleCategory>> = {
  clean_title: "clean",
  rebuilt_title: "rebuilt",
  salvage_title: "salvage",
  repairable: "rebuildable",
  // Legacy `titleType=parts` / `parts_only`: parts cars are salvage-titled (sub-chip). Use
  // `lane=parts` for parts_only alone.
  parts: "salvage",
  parts_only: "salvage",
};

/**
 * Parse `titleType=clean|rebuilt|salvage|rebuildable|unknown` (comma-multi). "all", empty and
 * unrecognised tokens are dropped; an empty result means "no title filter".
 */
export function parseTitleTypes(
  raw: string | null | undefined,
): TitleCategory[] {
  const out: TitleCategory[] = [];
  for (const token of String(raw ?? "").split(",")) {
    const t = token.trim().toLowerCase();
    const category = isTitleCategory(t) ? t : TITLE_TYPE_ALIASES[t];
    if (category && !out.includes(category)) out.push(category);
  }
  return out;
}

/**
 * PostgREST `.or()` expression for the categories on `deals.condition`, or null for no filter.
 * Uses `.or()` (not `.in()`) so "unknown" can include NULL condition rows.
 */
export function titleCategoryOrFilter(
  categories: readonly TitleCategory[],
): string | null {
  if (!categories.length) return null;
  const { conditions, includeNull } = conditionsFor(categories);
  const parts: string[] = [];
  if (conditions.length) parts.push(`condition.in.(${conditions.join(",")})`);
  if (includeNull) parts.push("condition.is.null");
  return parts.length ? parts.join(",") : null;
}

/** Counts for all five buckets, always in TITLE_CATEGORIES order (zeros included). */
export function titleCategoryCounts(rows: readonly TitleRow[]): Array<{
  value: TitleCategory;
  count: number;
  label: string;
  partsOnly?: number;
}> {
  const counts = new Map<TitleCategory, number>(
    TITLE_CATEGORIES.map((c) => [c, 0]),
  );
  let partsOnly = 0;
  for (const row of rows || []) {
    const detail = titleCategoryDetail(row);
    counts.set(detail.category, (counts.get(detail.category) || 0) + 1);
    if (detail.partsOnly) partsOnly += 1;
  }
  return TITLE_CATEGORIES.map((value) => ({
    value,
    count: counts.get(value) || 0,
    label: TITLE_CATEGORY_LABELS[value],
    ...(value === "salvage" ? { partsOnly } : {}),
  }));
}
