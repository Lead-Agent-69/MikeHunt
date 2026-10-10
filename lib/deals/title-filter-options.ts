// Title filter options for every browse surface (Scan, Discover, Swipe, Map): the five buckets
// from Amy's title-category helper, with live counts when /api/scan/facets supplies them.
// Values are the `titleType` API param (clean|rebuilt|salvage|rebuildable|unknown).
import {
  TITLE_CATEGORIES,
  TITLE_CATEGORY_LABELS,
  isTitleCategory,
  type TitleCategory,
} from "@/lib/deals/title-category";

export type TitleFacet = {
  value?: unknown;
  count?: unknown;
  label?: unknown;
  partsOnly?: unknown;
};

export type TitleFilterOption = { value: "all" | TitleCategory; label: string };

function countLabel(category: TitleCategory, facet?: TitleFacet): string {
  const base = TITLE_CATEGORY_LABELS[category];
  if (!facet) return base;
  const count = Number(facet.count || 0);
  const partsOnly = Number(facet.partsOnly || 0);
  return category === "salvage" && partsOnly > 0
    ? `${base} (${count}, ${partsOnly} parts only)`
    : `${base} (${count})`;
}

/**
 * Apply a page-level title choice to an inventory query string. `null` keeps whatever the saved
 * scope sent; "all" drops titleType; a bucket sets titleType=<bucket>.
 */
export function withTitleType(query: string, title: string | null): string {
  if (title === null) return query;
  const params = new URLSearchParams(query);
  if (title === "all" || !isTitleCategory(title)) params.delete("titleType");
  else params.set("titleType", title);
  return params.toString();
}

/** The select value for a query: its single titleType bucket, else "all". */
export function titleTypeFromQuery(query: string): "all" | TitleCategory {
  const raw = new URLSearchParams(query).get("titleType") || "";
  return isTitleCategory(raw) ? raw : "all";
}

/**
 * All five buckets, always (Unknown included), in TITLE_CATEGORIES order. Facet rows that aren't
 * one of the buckets are ignored; a bucket missing from the facets shows without a count.
 */
export function titleFilterOptions(
  facets?: readonly TitleFacet[] | null,
  allLabel = "Title: All",
): TitleFilterOption[] {
  const byValue = new Map<TitleCategory, TitleFacet>();
  for (const f of Array.isArray(facets) ? facets : []) {
    const v = String(f?.value ?? "").toLowerCase();
    if (isTitleCategory(v)) byValue.set(v, f);
  }
  const live = byValue.size > 0;
  return [
    { value: "all", label: allLabel },
    ...TITLE_CATEGORIES.map((category) => ({
      value: category,
      label: countLabel(category, live ? byValue.get(category) : undefined),
    })),
  ];
}
