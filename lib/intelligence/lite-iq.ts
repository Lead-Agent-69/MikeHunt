// lib/intelligence/lite-iq.ts
// A zero-cost Deal IQ computed from fields a card already has — so every scan/discovery card can show
// its IQ tier WITHOUT an API call. Uses the same fusion core as the full Deal IQ; the deal page adds
// the richer signals (demand, timing, win-match, mispricing) on top.

import { computeDealIQ, type DealIQ } from "./deal-iq";

export interface LiteIQInput {
  askPrice?: number | null;
  sellEstimate?: number | null;
  mmrValue?: number | null;
  trueNetProfit?: number | null;
  profitEstimate?: number | null;
  distressed?: boolean;
  // Engine gate, so the chip never disagrees with the GO/PASS pill on the same card.
  dealVerdict?: string | null;
  priceImplausible?: boolean;
}

export function liteDealIQ(
  input: LiteIQInput,
): { score: number; tier: DealIQ["tier"] } | null {
  const ask = Number(input.askPrice) || 0;
  const sell = Number(input.sellEstimate ?? input.mmrValue) || 0;
  const profit = input.trueNetProfit ?? input.profitEstimate ?? null;
  // Need at least a resale figure or a profit number to say anything.
  if (ask <= 0 || (sell <= 0 && profit == null)) return null;

  // Guard: if sell_estimate looks circular (within 20% of ask × 1.25), don't show IQ
  if (input.sellEstimate && Math.abs(sell - ask * 1.25) < ask * 0.05) {
    return null; // hides the IQ chip — better to show nothing than a lie
  }

  const iq = computeDealIQ({
    askPrice: ask,
    sellEstimate: sell || null,
    compsConfidence: "medium",
    trueNetProfit: profit != null ? Number(profit) : null,
    distress: !!input.distressed,
    dealVerdict: input.dealVerdict,
    priceImplausible: input.priceImplausible,
  });

  const clampedScore = Math.min(100, Math.max(0, iq.score));

  // Display nothing if score < 20 (means data is too thin to trust)
  if (clampedScore < 20) return null;

  return { score: clampedScore, tier: iq.tier };
}

export const IQ_TIER_COLOR: Record<string, string> = {
  elite: "var(--green)",
  strong: "var(--amber)",
  fair: "var(--blue)",
  weak: "var(--t4)",
};
