// lib/scoring/payment-price.ts
//
// Detects when a listing's "price" is a FINANCING TEASER — a down payment, a monthly payment, or a
// buy-here-pay-here / "in-house financing" number — rather than the real cash SALE price. The canonical
// case: the SAME seller lists
//     "2025 CHEVROLET SILVERADO 2500 HD CUSTOM 4x4 IN-HOUSE AVAILABLE - $14,850"   (down payment / teaser)
//     "2025 CHEVROLET SILVERADO 2500 HD CUSTOM STRD BED 4x4 - $48,995"             (real cash price)
// The $14,850 is a down payment on a $48k truck. Left unchecked it (a) drags the comp median DOWN and
// (b) scores as an incredible "GO" that doesn't exist. So teaser listings are dropped from the comp index
// AND flagged on the deal so the analyzer never treats the number as a cash price.
//
// CONSERVATIVE by design: a plain "we finance" / "financing available" is NOT a teaser — a legit dealer can
// post a real cash price and also offer financing. Only the strong down-payment / BHPH / "as low as" / WAC
// markers count, because those are the ones where the shown number is a payment, not the price.

const TEASER_RE =
  /\$\s?\d[\d,]*\s*down\b|\bdown ?payment\b|\bper ?month\b|\ba month\b|\/mo\b|\bmonthly\b|\bo\.?a\.?c\.?\b|\bw\.?a\.?c\.?\b|\bin[-\s]?house\b|\bbuy ?here ?pay ?here\b|\bbhph\b|\bas low as\b|\bno credit\b|\bbad credit\b|lease ?(take ?over|takeover|transfer|assumption)|take ?over (the )?lease/i;

/** True when the title/description signals the price is a payment/teaser, not the cash sale price. */
export function looksLikePaymentPrice(text?: string | null): boolean {
  return !!text && TEASER_RE.test(text);
}
