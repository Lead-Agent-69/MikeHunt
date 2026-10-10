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

/** Where the stored condition came from (#211: deals.options.titleSource). null = not recorded. */
export type TitleSource = "listing" | "source_default";

/**
 * The one options key the client may see about title provenance. Reads `options.titleSource`
 * (object or JSON string) or a pre-projected `title_source`; anything else → null. Never returns
 * other options keys.
 */
export function titleSourceOf(row: unknown): TitleSource | null {
  if (!row || typeof row !== "object") return null;
  const r = row as { options?: unknown; title_source?: unknown };
  let options: unknown = r.options;
  if (typeof options === "string") {
    try {
      options = JSON.parse(options);
    } catch {
      options = null;
    }
  }
  const raw =
    (options && typeof options === "object"
      ? (options as { titleSource?: unknown }).titleSource
      : undefined) ?? r.title_source;
  return raw === "listing" || raw === "source_default" ? raw : null;
}

// ─── Sold-row headlines ──────────────────────────────────────────────────────────────────────────
// sold_listings has no condition enum: the only title evidence is the seller's headline text
// ("2018 Honda Accord EX, clean title"). This is the ONE classifier for those headlines, used by
// market-value (sold index lanes) and lib/arbitrage (sold comps), so the two never disagree.
//
//   Clean        only on an explicit, un-negated "clean title" / "title: clean" with no brand word
//   Salvage      salvage, flood, hail, fire, lemon/buyback, junk, branded title, COD, wrecked,
//                non-runner, and parts cars ("for parts", "parts only", "parts car", a bare
//                "parts" that is not "new/OEM/extra/with parts")
//   Rebuilt      rebuilt / reconstructed / restored title, when no salvage-class word is present
//   Rebuildable  repairable / rebuildable, when neither salvage-class nor rebuilt words are present
//   Unknown      everything else, including "Clean Carfax", "no accidents" and a bare headline
// Branded words map to the most conservative branded category (salvage → rebuilt → rebuildable:
// "rebuilt from salvage" is Salvage). Negated brand words ("not salvage", "never flooded", "no hail")
// are ignored. Any brand word beats a clean-title claim: "clean title, flood damage" is not clean.
// "not clean title" / "clean title pending" are Unknown.

// A car sold for parts, said outright.
const SOLD_PARTS_CAR_RX =
  /\b(?:for[\s-]+parts(?:[\s-]+(?:or|and|\/)[\s-]+(?:repair|not[\s-]+working))?|parts[\s-]+only|parts[\s-]+(?:car|truck|vehicle))\b/i;
// A bare "parts" that is not "new parts", "OEM parts", "extra parts", "with parts"... (checked by
// hand, not a lookbehind, because this module also ships to the browser).
const SOLD_PARTS_WORD_RX = /(\S+)?[\s-]+parts\b|^parts\b/gi;
const NOT_PARTS_CAR_BEFORE = new Set([
  "new",
  "oem",
  "aftermarket",
  "extra",
  "spare",
  "upgraded",
  "performance",
  "original",
  "factory",
  "with",
  "w/",
  "plus",
  "and",
  "+",
]);
function hasBarePartsWord(text: string): boolean {
  const rx = new RegExp(SOLD_PARTS_WORD_RX.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    const before = (m[1] || "").toLowerCase().replace(/[,;:()]+$/, "");
    if (!NOT_PARTS_CAR_BEFORE.has(before)) return true;
  }
  return false;
}
const SOLD_REBUILT_RX =
  /\b(?:rebuilt|re-?built|reconstructed|restored[\s-]+title|prior[\s-]+salvage|previously[\s-]+salvaged?)\b/i;
const SOLD_REBUILDABLE_RX = /\b(?:repairable|rebuildable|rebuilder)\b/i;
const SOLD_SALVAGE_RX =
  /\b(?:salvage[d]?|flood(?:ed)?|hail|fire[\s-]+damage(?:d)?|lemon|buy[\s-]?back|junk|branded[\s-]+title|title[\s-]+brand(?:ed)?|certificate[\s-]+of[\s-]+destruction|cod|non-?runner|not[\s-]+running|wreck(?:ed)?|totaled|total[\s-]+loss)\b/i;
const SOLD_BRAND_WORD =
  "salvage[d]?|flood(?:ed)?|hail|fire|lemon|buy[\\s-]?back|junk|rebuilt|reconstructed|branded|wreck(?:ed)?|accidents?|damage[d]?|repairable|rebuildable";
// "not salvage", "never flooded", "no hail damage", "non-salvage", "not a rebuilt"
const SOLD_NEGATED_BRAND_RX = new RegExp(
  `\\b(?:not|no|never|non|without|zero)[\\s-]+(?:a[\\s-]+|an[\\s-]+|been[\\s-]+)?(?:${SOLD_BRAND_WORD})(?:[\\s-]+(?:title|damage|history))?\\b`,
  "gi",
);
const SOLD_CLEAN_NEGATED_RX =
  /\b(?:not|no|non|unknown|unconfirmed|pending|missing)[\s-]+(?:a[\s-]+)?clean[\s-]+title\b|\bclean[\s-]+title[\s:=?-]+(?:unknown|unconfirmed|pending|not[\s-]+(?:confirmed|verified|available|in[\s-]+hand)|no\s*$|\?)/i;
const SOLD_CLEAN_RX = /\bclean[\s-]+title\b|\btitle[\s:=-]+clean\b/i;

/** Title bucket for a sold-row headline. See the table above; Unknown unless the text says so. */
export function soldTitleCategory(
  headline: string | null | undefined,
): TitleCategory {
  const raw = String(headline ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "unknown";
  if (isPartsOnlySoldHeadline(raw)) return "salvage";
  const text = raw.replace(SOLD_NEGATED_BRAND_RX, " ");
  // Most conservative branded category first: salvage (and other brands) → rebuilt → rebuildable,
  // so "rebuilt from salvage" / "rebuildable salvage" are Salvage (same order as lib/arbitrage).
  if (SOLD_SALVAGE_RX.test(text)) return "salvage";
  if (SOLD_REBUILT_RX.test(text)) return "rebuilt";
  if (SOLD_REBUILDABLE_RX.test(text)) return "rebuildable";
  if (SOLD_CLEAN_NEGATED_RX.test(raw)) return "unknown";
  return SOLD_CLEAN_RX.test(raw) ? "clean" : "unknown";
}

/** True when a sold headline says outright it is a car sold for parts ("for parts", "parts car"). */
export function isPartsCarSoldHeadline(
  headline: string | null | undefined,
): boolean {
  return SOLD_PARTS_CAR_RX.test(String(headline ?? ""));
}

/** Salvage with the parts-only sub-chip: a parts car, or a headline with a bare "parts". */
export function isPartsOnlySoldHeadline(
  headline: string | null | undefined,
): boolean {
  const text = String(headline ?? "");
  return SOLD_PARTS_CAR_RX.test(text) || hasBarePartsWord(text);
}
