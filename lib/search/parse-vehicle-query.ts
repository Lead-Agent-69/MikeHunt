// Deterministic natural-language search parser for /scan ("ford f-150 under 15k in TX 2015+").
// Free and keyless: no model call, nothing invented. Only values literally present in the query
// come back.

import {
  extractMake,
  extractModel,
} from "@/lib/scrapers/tools/deal-normalizer";
import { US_STATES } from "@/lib/geo/us-states";

export interface ParsedVehicleQuery {
  make?: string;
  model?: string;
  minYear?: string;
  maxYear?: string;
  minPrice?: string;
  maxPrice?: string;
  maxMileage?: string;
  zip?: string;
  radius?: string;
  state?: string;
}

const MAX_QUERY_LENGTH = 200;
const MODEL_STOPWORDS = new Set([
  "under",
  "below",
  "less",
  "max",
  "in",
  "for",
  "near",
  "with",
  "and",
  "or",
  "up",
  "around",
  "from",
  "salvage",
  "clean",
  "title",
  "cheap",
]);

const STATE_NAMES = Object.entries(US_STATES)
  .map(([code, [name]]) => [code, String(name).toLowerCase()] as const)
  .sort((a, b) => b[1].length - a[1].length);

function money(raw: string, k?: string): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return undefined;
  const value = k ? n * 1000 : n;
  return value >= 500 && value <= 500_000 ? Math.round(value) : undefined;
}

function parseMaxPrice(q: string): number | undefined {
  const cue = q.match(
    /\b(?:under|below|less than|max(?:imum)?|up to|budget|<)\s*\$?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b(?!\s*(?:mi\b|miles|mileage))/i,
  );
  if (cue) return money(cue[1], cue[2]);
  const dollars = q.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i);
  if (dollars) return money(dollars[1], dollars[2]);
  const thousands = q.match(/\b(\d{1,3}(?:\.\d+)?)\s*k\b(?!\s*(?:mi|miles))/i);
  if (thousands) return money(thousands[1], "k");
  return undefined;
}

const validYear = (y: number) =>
  y >= 1950 && y <= new Date().getFullYear() + 1 ? y : undefined;

/** Years: "2018-2022", "2018 to 2022", "2015+", "2015 or newer", "before 2020", "2019 or older", "2018". */
export function parseYears(q: string): { min?: number; max?: number } {
  const range = q.match(/\b((?:19|20)\d{2})\s*(?:-|–|to|thru|through)\s*((?:19|20)\d{2})\b/i);
  if (range) {
    let a = validYear(Number(range[1]));
    let b = validYear(Number(range[2]));
    if (a && b && a > b) [a, b] = [b, a];
    return { min: a, max: b };
  }
  const maxOnly =
    q.match(/\b(?:before|older than|up to|until|pre)\s*((?:19|20)\d{2})\b/i) ||
    q.match(/\b((?:19|20)\d{2})\s*(?:or\s+(?:older|earlier)|and\s+(?:older|earlier))\b/i);
  if (maxOnly) {
    const y = validYear(Number(maxOnly[1]));
    // "before 2020" excludes 2020; "up to 2020" / "2020 or older" include it.
    return { max: y && /before|older than|pre/i.test(maxOnly[0]) && !/or older/i.test(maxOnly[0]) ? y - 1 : y };
  }
  const match = q.match(/\b((?:19|20)\d{2})\b/);
  return match ? { min: validYear(Number(match[1])) } : {};
}

/** 5-digit ZIP that isn't a year or a price ("near 60601", "zip 73301", "in 66101"). */
export function parseZip(q: string): string | undefined {
  const cued = q.match(/\b(?:near|zip|around|in|by|of)\s*:?\s*(\d{5})\b/i);
  if (cued) return cued[1];
  // A bare 5-digit number is a ZIP only when nothing marks it as money or miles.
  const re = /(^|\s)(\d{5})(?=\s|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) {
    const before = q.slice(0, m.index).trim().split(/\s+/).pop() || "";
    const after = q.slice(m.index + m[0].length).trim().split(/\s+/)[0] || "";
    if (/^(under|below|less|than|over|above|least|from|max|maximum|min|minimum|to|budget|\$)$/i.test(before)) continue;
    if (/^(k|mi|miles?|mileage|dollars?)$/i.test(after)) continue;
    return m[2];
  }
  return undefined;
}

/** "within 50 miles", "50 mi radius", "100 mile radius". */
export function parseRadius(q: string): number | undefined {
  const m =
    q.match(/\bwithin\s*(\d{1,4})\s*(?:mi|miles?)\b/i) ||
    q.match(/\b(\d{1,4})\s*(?:mi|miles?)\s*radius\b/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n > 0 && n <= 3000 ? n : undefined;
}

/** "under 100k miles", "less than 80,000 mi", "max 120k mileage". */
export function parseMaxMileage(q: string): number | undefined {
  const m = q.match(
    /\b(?:under|below|less than|max(?:imum)?|up to|<)\s*(\d[\d,]*)\s*(k)?\s*(?:mi\b|miles|mileage)/i,
  );
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, "")) * (m[2] ? 1000 : 1);
  return n > 0 && n < 1_000_000 ? n : undefined;
}

/** "over 5k", "from $8,000", "at least 5000", "$8k-$15k". */
function parsePriceRange(q: string): { min?: number; max?: number } {
  const range = q.match(/\$\s*(\d[\d,]*)\s*(k)?\s*(?:-|–|to)\s*\$?\s*(\d[\d,]*)\s*(k)?\b/i);
  if (range) return { min: money(range[1], range[2]), max: money(range[3], range[4] || range[2]) };
  const min = q.match(/\b(?:over|above|at least|from|min(?:imum)?|>)\s*\$?\s*(\d[\d,]*)\s*(k)?\b(?!\s*(?:mi\b|miles|mileage))/i);
  return min ? { min: money(min[1], min[2]) } : {};
}

function parseState(q: string): string | undefined {
  // Upper-case two-letter codes anywhere ("TX"), or any case after "in" ("in tx").
  // Bare lower-case "in"/"or"/"me"/"ok" are words, not states.
  const upper = q.match(/\b([A-Z]{2})\b/g) || [];
  for (const token of upper) if (US_STATES[token]) return token;
  const afterIn = q.match(/\bin\s+([a-z]{2})\b/i);
  if (afterIn && US_STATES[afterIn[1].toUpperCase()])
    return afterIn[1].toUpperCase();
  const lower = ` ${q.toLowerCase()} `;
  for (const [code, name] of STATE_NAMES) {
    if (lower.includes(` ${name} `)) return code;
  }
  return undefined;
}

export function parseVehicleQuery(input: string): ParsedVehicleQuery {
  const q = String(input || "")
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
  if (!q) return {};
  const out: ParsedVehicleQuery = {};

  const make = extractMake(q);
  if (make) {
    out.make = make;
    // Aliases ("chevy" → Chevrolet): swap the alias token for the canonical make so the
    // model after it is still found.
    const aliasToken = q
      .split(/\s+/)
      .find((token) => extractMake(token) === make);
    const modelSource =
      aliasToken && !new RegExp(make, "i").test(q)
        ? q.replace(aliasToken, make)
        : q;
    const model = extractModel(modelSource, make);
    if (
      model &&
      !MODEL_STOPWORDS.has(model.toLowerCase()) &&
      !/^(19|20)\d{2}$/.test(model) &&
      !/^\$?\d[\d,]*k?$/i.test(model)
    ) {
      out.model = model;
    }
  }

  const years = parseYears(q);
  if (years.min) out.minYear = String(years.min);
  if (years.max) out.maxYear = String(years.max);

  const zip = parseZip(q);
  if (zip) out.zip = zip;
  const radius = parseRadius(q);
  if (radius) out.radius = String(radius);
  const maxMileage = parseMaxMileage(q);
  if (maxMileage) out.maxMileage = String(maxMileage);

  // Ignore year/zip/mileage tokens when looking for a price.
  let priceText = q;
  for (const y of [years.min, years.max]) if (y) priceText = priceText.replace(String(y), " ");
  if (zip) priceText = priceText.replace(zip, " ");
  priceText = priceText.replace(
    /\b(?:under|below|less than|max(?:imum)?|up to|<)\s*\d[\d,]*\s*k?\s*(?:mi\b|miles|mileage)/gi,
    " ",
  );
  const range = parsePriceRange(priceText);
  const maxPrice =
    range.max ??
    parseMaxPrice(
      priceText.replace(
        /\b(?:over|above|at least|from|min(?:imum)?|>)\s*\$?\s*\d[\d,]*\s*k?\b/gi,
        " ",
      ),
    );
  if (maxPrice) out.maxPrice = String(maxPrice);
  if (range.min && (!maxPrice || range.min < maxPrice)) out.minPrice = String(range.min);

  const state = parseState(q);
  if (state) out.state = state;

  return out;
}
