// Placeholder / bait price detection. Dealers and bots routinely list "$1,234", "$111,111", "$1",
// "$12345" as stand-ins for "call for price" — and those numbers, if averaged into our comps, poison
// every valuation downstream. This is a CONSERVATIVE pattern check used to (a) exclude such prices
// from the market-comp index and (b) flag a listing — NOT to hard-delete it, since a number alone can't
// always distinguish a placeholder from a real price (e.g. $9,999 is both a common real ask AND a bait).
// The market-relative detector (price-sanity.ts) remains the primary deal-level guard for subtler cases.

export function looksLikePlaceholderPrice(price?: number | null): boolean {
  if (price == null || !isFinite(price)) return false;
  const p = Math.round(price);
  // No titled vehicle realistically sells for under ~$300 — deposits, parts, or "$1" bait.
  if (p < 300) return true;
  const s = String(p);
  // All-same-digit, 4+ places: 1111, 11111, 222222 (digit 1-8 only — NOT 9999/99999, which are common
  // legitimate "call for price" asks, so we don't nuke a real $9,999).
  if (/^([1-8])\1{3,}$/.test(s)) return true;
  // Strict ascending or descending keyboard-walk, 4+ places: 1234, 12345, 123456, 4321, 54321.
  if (s.length >= 4 && ("123456789".includes(s) || "987654321".includes(s)))
    return true;
  return false;
}
