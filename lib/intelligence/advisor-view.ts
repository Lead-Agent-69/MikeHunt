// The advisor card's view of one /api/check-listing read (#254, docs/intelligence-advisor.md).
// Pure, so the deal page card, the DealCard summary and tests share one honesty gate:
//
// - "not_live": the listing isn't live, so the card says so and never shows Buy or a price.
// - No verdict and no price unless the read has a real basis: verdict "not_enough_data",
//   confidence "low"/"none", or a missing/insufficient fair value all mean "Not enough data".
//   One exception, from the contract: on the personal desk a not_enough_data read can still carry
//   a labelled fair value, which is shown on its own, with no verdict.
// - A number is shown only when it exists and its basis isn't "insufficient", with its basis label.
// - Profit and the sell market are flip-desk only (isFlipBuyerMode). This is enforced here even
//   though the API already redacts them for personal callers (readForDesk).
import type {
  Basis,
  CheckListingRead,
} from "@/lib/intelligence/check-listing";

export const NOT_ENOUGH_DATA = "Not enough data";
/** Shown when the read couldn't be fetched (rate limit, market data down). */
export const NOT_ENOUGH_DATA_YET = "Not enough data yet";
export const NOT_LIVE = "Listing not live";

export const BASIS_LABEL: Readonly<Record<Basis, string>> = {
  measured: "from recent sales",
  estimate: "estimate from live asks",
  insufficient: NOT_ENOUGH_DATA,
};

export type AdvisorNumber = { value: number; basisLabel: string };

/** One line of the flip-desk cost breakdown (Why sheet). `sign` is how it moves profit. */
export type AdvisorCostLine = { label: string; value: number; sign: "+" | "-" | "=" };

export type AdvisorView =
  | { state: "insufficient"; headline: string; reason: string }
  | { state: "not_live"; headline: string; reason: string }
  | {
      /** Personal desk, not_enough_data, but with a labelled fair value: no verdict. */
      state: "fair_only";
      headline: string;
      fairValue: AdvisorNumber;
      reason: string;
      confidenceNote: string | null;
    }
  | {
      state: "ready";
      verdict: "buy" | "wait" | "pass";
      word: "Buy" | "Wait" | "Pass";
      headline: string;
      buyCeiling: AdvisorNumber | null;
      fairValue: AdvisorNumber;
      /** Flip desks only. */
      profit: AdvisorNumber | null;
      /** Flip desks only. */
      sellMarket: (AdvisorNumber & { state: string | null }) | null;
      confidence: "high" | "medium";
      /** "Medium confidence" under the verdict; null when high. */
      confidenceNote: string | null;
      /** Flip desks only: buy, fees, transport, recon, repair, selling, sale, profit. Only lines
       *  the API returned; empty on personal desks. */
      breakdown: AdvisorCostLine[];
      why: string[];
      assumptions: string[];
      compsLine: string;
    };

const WORD = { buy: "Buy", wait: "Wait", pass: "Pass" } as const;

function shown(
  value: number | null | undefined,
  basis: Basis,
  label?: string | null,
): AdvisorNumber | null {
  if (value == null || !Number.isFinite(value) || basis === "insufficient")
    return null;
  return { value, basisLabel: label || BASIS_LABEL[basis] };
}

function compsLine(read: CheckListingRead): string {
  const n = read.comps.asks + read.comps.sold;
  if (!n) return "No comparable cars found.";
  const kind =
    read.comps.sold > 0
      ? `${read.comps.sold} sold, ${read.comps.asks} listed`
      : `${read.comps.asks} listed`;
  return `Based on ${n} comparable car${n === 1 ? "" : "s"} (${kind}).`;
}

const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

/**
 * The engine's cost line, top to bottom, from fields the API actually returned. Profit and
 * sale only appear with a real basis; a missing field is left out, never filled in.
 */
export function costBreakdown(read: CheckListingRead): AdvisorCostLine[] {
  const p = read.profit;
  if (!p) return [];
  const sale = shown(read.resale.value, read.resale.basis);
  const net = shown(p.net, p.basis);
  if (!sale || !net) return [];
  const lines: AdvisorCostLine[] = [];
  if (finite(read.vehicle.price))
    lines.push({ label: "Buy", value: read.vehicle.price, sign: "-" });
  const costs: Array<[string, unknown]> = [
    ["Fees", p.fees],
    ["Transport", p.transport],
    ["Recon", p.recon],
    ["Repair", p.repair],
    ["Selling cost", p.sellingCost],
  ];
  for (const [label, v] of costs)
    if (finite(v) && v > 0) lines.push({ label, value: v, sign: "-" });
  lines.push({
    label: read.resale.state
      ? `Expected sale in ${read.resale.state}`
      : "Expected sale",
    value: sale.value,
    sign: "+",
  });
  lines.push({ label: "Profit", value: net.value, sign: "=" });
  return lines;
}

export function advisorView(
  read: CheckListingRead | null | undefined,
  opts: { flipDesk: boolean },
): AdvisorView {
  if (!read)
    return {
      state: "insufficient",
      headline: NOT_ENOUGH_DATA,
      reason: "We don't have enough on this car to give a read.",
    };
  if (read.verdict === "not_live")
    return {
      state: "not_live",
      headline: NOT_LIVE,
      reason: read.headline || read.live?.label || "This listing is no longer live.",
    };
  const fair = shown(
    read.fairValue.value,
    read.fairValue.basis,
    read.fairValue.label,
  );
  const lowConfidence =
    read.confidence.label === "low" || read.confidence.label === "none";
  if (read.verdict === "not_enough_data" && !opts.flipDesk && fair)
    return {
      state: "fair_only",
      headline: NOT_ENOUGH_DATA,
      fairValue: fair,
      reason: read.headline,
      confidenceNote: lowConfidence ? "Low confidence" : null,
    };
  if (read.verdict === "not_enough_data" || lowConfidence || !fair) {
    return {
      state: "insufficient",
      headline: NOT_ENOUGH_DATA,
      reason:
        lowConfidence && fair
          ? `Too little market evidence to price this car confidently. ${compsLine(read)}`
          : `Too few comparable cars to price this one. ${compsLine(read)}`,
    };
  }
  const verdict = read.verdict;
  const resale = opts.flipDesk
    ? shown(read.resale.value, read.resale.basis)
    : null;
  return {
    state: "ready",
    verdict,
    word: WORD[verdict],
    headline: read.headline,
    buyCeiling: shown(read.maxBuy.value, read.maxBuy.basis),
    fairValue: fair,
    profit:
      opts.flipDesk && read.profit
        ? shown(read.profit.net, read.profit.basis)
        : null,
    sellMarket: resale ? { ...resale, state: read.resale.state } : null,
    confidence: read.confidence.label as "high" | "medium",
    confidenceNote:
      read.confidence.label === "medium" ? "Medium confidence" : null,
    breakdown: opts.flipDesk ? costBreakdown(read) : [],
    why: read.why.slice(0, 4),
    assumptions: read.assumptions,
    compsLine: compsLine(read),
  };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST body for /api/check-listing from a tracked deal: just its `dealId`. The route reads the
 * stored row (no page scrape) and keeps the car out of its own comps. Null when there's no
 * tracked id, so the card shows "Not enough data" instead of guessing from loose fields.
 */
export function advisorRequestFor(
  deal: Record<string, unknown> | null | undefined,
  opts: { homeState?: string | null } = {},
): { dealId: string; homeState?: string } | null {
  const id = typeof deal?.id === "string" ? deal.id.trim() : "";
  if (!UUID_RE.test(id)) return null;
  const home = opts.homeState?.trim().toUpperCase();
  return {
    dealId: id.toLowerCase(),
    ...(home && /^[A-Z]{2}$/.test(home) ? { homeState: home } : {}),
  };
}
