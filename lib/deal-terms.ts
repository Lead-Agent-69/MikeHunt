// lib/deal-terms.ts
// Channel-correct buy terminology. You BID at an auction, make an OFFER on a private/marketplace ask,
// and pay a PRICE at retail — so "max bid" on a Carvana car is just wrong. This now delegates to the
// single source of truth in lib/sources/source-meta.ts (kept as a thin back-compat shim so existing
// call sites pick up the richer per-channel wording automatically).

import { buyTerms, isAuctionChannel } from "@/lib/sources/source-meta";

/** True when the source is a live auction (you place a BID), not a fixed/asking-price listing. */
export function isAuctionSource(source?: string | null): boolean {
  return isAuctionChannel(source);
}

/** Channel-appropriate buy terminology for labels/copy. */
export function buyTerm(source?: string | null): {
  /** "Max bid" (auction) | "Max offer" (marketplace/private) | "Buy under" (retail) */
  label: string;
  /** "bid" | "offer" | "buy" — for sentences */
  verb: string;
  /** what the seller's listed number represents */
  priceLabel: string;
} {
  const t = buyTerms(source);
  return { label: t.maxLabel, verb: t.verb, priceLabel: t.priceLabel };
}
