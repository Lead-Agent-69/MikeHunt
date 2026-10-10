import type { MultiSiteFilters } from "./types";

const int = (v: unknown): number | undefined => {
  const n =
    typeof v === "string" ? Number(v.replace(/[$,\s]/g, "")) : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

const clean = (v: unknown): string | undefined => {
  const s = String(v ?? "").trim();
  if (!s || /^(all|any)$/i.test(s)) return undefined;
  return s.replace(/\s+/g, " ");
};

/** Sanitize raw UI filter values ("any", "all", "$25,000", swapped years) into usable filters. */
export function normalizeFilters(
  raw: Record<string, unknown>,
): MultiSiteFilters {
  let yearMin = int(raw.yearMin);
  let yearMax = int(raw.yearMax);
  if (yearMin && (yearMin < 1900 || yearMin > 2100)) yearMin = undefined;
  if (yearMax && (yearMax < 1900 || yearMax > 2100)) yearMax = undefined;
  if (yearMin && yearMax && yearMin > yearMax)
    [yearMin, yearMax] = [yearMax, yearMin];
  let priceMin = int(raw.priceMin);
  let priceMax = int(raw.priceMax);
  if (priceMin && priceMax && priceMin > priceMax)
    [priceMin, priceMax] = [priceMax, priceMin];
  const zipMatch = String(raw.zip ?? "")
    .trim()
    .match(/^(\d{5})(-\d{4})?$/);
  const title = clean(raw.title)?.toLowerCase();
  return {
    make: clean(raw.make),
    model: clean(raw.model),
    yearMin,
    yearMax,
    priceMin,
    priceMax,
    milesMax: int(raw.milesMax),
    zip: zipMatch ? zipMatch[1] : undefined,
    radiusMi: int(raw.radiusMi),
    title:
      title === "clean" || title === "salvage" || title === "rebuilt"
        ? title
        : undefined,
  };
}

/** "Land Rover" → "land-rover", "F-150" → "f-150". */
export function slug(v: string): string {
  return v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
}

/** Build a query string, skipping empty values. Arrays repeat the key. */
export function qs(
  params: Record<string, string | number | undefined | (string | number)[]>,
) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) for (const item of v) out.append(k, String(item));
    else out.append(k, String(v));
  }
  return out.toString();
}

/** Snap a radius up to the nearest value a site accepts (largest if beyond). */
export function snapRadius(
  mi: number | undefined,
  allowed: number[],
): number | undefined {
  if (!mi) return undefined;
  return allowed.find((a) => a >= mi) ?? allowed[allowed.length - 1];
}

export function yearsList(min?: number, max?: number): number[] {
  if (!min || !max || max - min > 10) return [];
  const out: number[] = [];
  for (let y = min; y <= max; y++) out.push(y);
  return out;
}

/** Which of `keys` are set on the filters (used to report what a site dropped). */
export function present(f: MultiSiteFilters, keys: (keyof MultiSiteFilters)[]) {
  return keys.filter((k) => f[k] !== undefined && f[k] !== "any");
}
