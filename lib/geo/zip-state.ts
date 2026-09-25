// lib/geo/zip-state.ts
//
// ZIP → state, and a tiny search-scope resolver, so a user can type a city, ZIP, or "City, ST" and land
// exactly there instead of being forced to pick a whole state first. ZIP→state uses the canonical USPS
// 3-digit-prefix ranges (free, deterministic, no lookup table of every ZIP).

import { US_STATES } from "./us-states";

// [prefixStart, prefixEnd, state] over the first 3 ZIP digits (000–999). Canonical USPS SCF assignment.
const RANGES: [number, number, string][] = [
  [5, 5, "NY"],
  [10, 27, "MA"],
  [28, 29, "RI"],
  [30, 38, "NH"],
  [39, 49, "ME"],
  [50, 59, "VT"],
  [60, 69, "CT"],
  [70, 89, "NJ"],
  [100, 149, "NY"],
  [150, 196, "PA"],
  [197, 199, "DE"],
  [200, 205, "DC"],
  [206, 219, "MD"],
  [220, 246, "VA"],
  [247, 268, "WV"],
  [270, 289, "NC"],
  [290, 299, "SC"],
  [300, 319, "GA"],
  [320, 349, "FL"],
  [350, 369, "AL"],
  [370, 385, "TN"],
  [386, 397, "MS"],
  [398, 399, "GA"],
  [400, 427, "KY"],
  [430, 459, "OH"],
  [460, 479, "IN"],
  [480, 499, "MI"],
  [500, 528, "IA"],
  [530, 549, "WI"],
  [550, 567, "MN"],
  [570, 577, "SD"],
  [580, 588, "ND"],
  [590, 599, "MT"],
  [600, 629, "IL"],
  [630, 658, "MO"],
  [660, 679, "KS"],
  [680, 693, "NE"],
  [700, 714, "LA"],
  [716, 729, "AR"],
  [730, 749, "OK"],
  [750, 799, "TX"],
  [800, 816, "CO"],
  [820, 831, "WY"],
  [832, 838, "ID"],
  [840, 847, "UT"],
  [850, 865, "AZ"],
  [870, 884, "NM"],
  [889, 898, "NV"],
  [900, 961, "CA"],
  [967, 968, "HI"],
  [970, 979, "OR"],
  [980, 994, "WA"],
  [995, 999, "AK"],
];

/** State (2-letter) for a 5-digit ZIP, or null if it isn't a recognizable US ZIP. */
export function zipToState(zip: string): string | null {
  const m = String(zip)
    .trim()
    .match(/^(\d{3})\d{0,2}$/);
  if (!m) return null;
  const p = Number(m[1]);
  for (const [a, b, st] of RANGES) if (p >= a && p <= b) return st;
  return null;
}

export interface SearchScope {
  state: string | null; // null = nationwide
  q: string; // text to pre-filter the list by (address/city/zip/keyword)
  label: string; // human echo of what we resolved
}

/**
 * Turn a free-text query (ZIP, "City, ST", a state name/code, or a plain city/keyword) into a scope.
 * ZIP → its state + the ZIP as filter; a trailing 2-letter state → that state; otherwise nationwide + the
 * text as a filter (the list's free-text search matches city/zip/signals).
 */
export function resolveSearchScope(query: string): SearchScope {
  const q = query.trim();
  if (!q) return { state: null, q: "", label: "Nationwide" };

  // 5-digit ZIP.
  const zip = q.match(/^\d{5}$/)?.[0];
  if (zip) {
    const st = zipToState(zip);
    return {
      state: st,
      q: zip,
      label: st ? `${zip} · ${US_STATES[st]?.[0] || st}` : zip,
    };
  }

  // A 2-letter state code on its own, or trailing "City, ST".
  const tok = q.match(/(?:^|[,\s])([A-Za-z]{2})\s*$/)?.[1]?.toUpperCase();
  if (tok && US_STATES[tok]) {
    return { state: tok, q, label: q };
  }

  // A full state name typed out.
  const byName = Object.keys(US_STATES).find(
    (code) => US_STATES[code][0].toLowerCase() === q.toLowerCase(),
  );
  if (byName) return { state: byName, q: "", label: US_STATES[byName][0] };

  // Plain city/keyword — search nationwide and let the list filter to it.
  return { state: null, q, label: `“${q}” · nationwide` };
}
