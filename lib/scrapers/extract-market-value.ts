// lib/scrapers/extract-market-value.ts
//
// Schema-AGNOSTIC market-value harvester. Retail sources (cars.com, TrueCar, Carvana…) embed a
// third-party market value / price rating in their JSON — like AutoTrader's KBB Fair Purchase Price —
// but each hides it under a different field name and nesting. Rather than reverse-engineer every schema
// (which needs a clean IP we don't always have), this finds the value by PATTERN: any numeric field
// whose name (or its parent's) reads like a market value, within a sane band of the ask. Sanity-bounded
// so a wrong field can't poison the number, and it only feeds mmr_value (one signal among comps), so the
// downside is tiny and washes out. The fleet runs this on clean IPs; values flow to the knowledge base.

const VALUE_KEY_RE =
  /market.?(value|average|price)|fair.?(purchase|market)?.?price|fpp|price.?advisor|advisor.?price|estimated.?(value|price|worth)|kbb|mmr|book.?value|retail.?value|typical.?(price|value)|avg.?(price|market)|going.?price/i;

const VALUE_PARENT_RE =
  /market|pricing|valuation|advisor|priceanalysis|analysis|appraisal/i;

// Keys that look like a value but are NOT the market value (the car's own listed price, MSRP when new,
// monthly payments, fees) — exclude so we don't just echo the ask or grab a payment.
const REJECT_KEY_RE =
  /msrp|monthly|payment|down|lease|\bfee\b|tax|deposit|mileage|odometer|vin|year|zip|\bid\b/i;

const toNum = (v: unknown): number | null => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (isFinite(n) && /\d/.test(v)) return n;
  }
  return null;
};

/**
 * Find the most plausible third-party market value embedded anywhere in a listing object.
 * Returns null when nothing value-shaped is in a sane band of the ask.
 */
export function findMarketValue(
  root: unknown,
  askPrice: number,
  maxDepth = 5,
): number | null {
  if (!root || typeof root !== "object" || !askPrice || askPrice < 500)
    return null;
  // A market value should sit near the ask — wide enough for a steal or an overpriced lot, tight enough
  // to reject payments ($399) and MSRPs (2×+). Below this band it's a fee/payment; above, it's MSRP.
  const lo = askPrice * 0.45;
  const hi = askPrice * 2.2;
  const candidates: number[] = [];

  const walk = (o: any, depth: number, parentKey: string) => {
    if (!o || typeof o !== "object" || depth > maxDepth) return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && typeof v === "object") {
        walk(v, depth + 1, k);
        continue;
      }
      if (REJECT_KEY_RE.test(k)) continue;
      const named = VALUE_KEY_RE.test(k);
      const parented = VALUE_PARENT_RE.test(parentKey);
      if (!named && !parented) continue;
      const n = toNum(v);
      if (n != null && n >= lo && n <= hi && n > 800) {
        // A value named explicitly (kbbFpp, marketValue) is stronger than one merely under a
        // "pricing" parent — weight named hits by counting them twice.
        candidates.push(n);
        if (named) candidates.push(n);
      }
    }
  };
  walk(root, 0, "");

  if (!candidates.length) return null;
  candidates.sort((a, b) => a - b);
  return Math.round(candidates[Math.floor(candidates.length / 2)]); // robust median
}
