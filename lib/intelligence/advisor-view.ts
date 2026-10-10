// The advisor card's view of one /api/check-listing read (#254, docs/intelligence-advisor.md).
// Pure, so the deal page card, the DealCard summary and tests share one honesty gate:
//
// - No verdict and no price unless the read has a real basis: verdict "not_enough_data",
//   confidence "low"/"none", or a missing/insufficient fair value all mean "Not enough data".
// - A number is shown only when it exists and its basis isn't "insufficient", with its basis label.
// - Profit and the sell market are flip-desk only (isFlipBuyerMode). This is enforced here even
//   though the API already redacts them for personal callers (readForDesk).
import type { Basis, CheckListingRead } from "@/lib/intelligence/check-listing";
import { titleCategory } from "@/lib/deals/title-category";

export const NOT_ENOUGH_DATA = "Not enough data";

export const BASIS_LABEL: Readonly<Record<Basis, string>> = {
  measured: "from recent sales",
  estimate: "estimate from live asks",
  insufficient: NOT_ENOUGH_DATA,
};

export type AdvisorNumber = { value: number; basisLabel: string };

export type AdvisorView =
  | { state: "insufficient"; headline: string; reason: string }
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
      why: string[];
      assumptions: string[];
      compsLine: string;
    };

const WORD = { buy: "Buy", wait: "Wait", pass: "Pass" } as const;

function shown(
  value: number | null | undefined,
  basis: Basis,
): AdvisorNumber | null {
  if (value == null || !Number.isFinite(value) || basis === "insufficient")
    return null;
  return { value, basisLabel: BASIS_LABEL[basis] };
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
  const fair = shown(read.fairValue.value, read.fairValue.basis);
  const lowConfidence =
    read.confidence.label === "low" || read.confidence.label === "none";
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
    profit: opts.flipDesk ? shown(read.profit.net, read.profit.basis) : null,
    sellMarket: resale ? { ...resale, state: read.resale.state } : null,
    confidence: read.confidence.label as "high" | "medium",
    why: read.why.slice(0, 4),
    assumptions: read.assumptions,
    compsLine: compsLine(read),
  };
}

type AdvisorDeal = Record<string, unknown> | null | undefined;

const pick = (d: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (d[k] != null && d[k] !== "") return d[k];
  return undefined;
};

/**
 * POST body for /api/check-listing from a tracked deal: the car's own fields only. No `url`, so
 * the route doesn't re-fetch the source page; the VIN (when present) keeps the car out of its own
 * comps. Returns null when the deal lacks make, model or a positive price (nothing to price).
 */
export function advisorRequestFor(
  deal: AdvisorDeal,
): Record<string, unknown> | null {
  if (!deal) return null;
  const make = pick(deal, "make");
  const model = pick(deal, "model");
  const price = Number(pick(deal, "askPrice", "ask_price") ?? 0);
  if (!make || !model || !(price > 0)) return null;
  const category = titleCategory({
    condition: pick(deal, "condition") as string,
  });
  const zip = String(pick(deal, "locationZip", "location_zip") ?? "");
  const vin = String(pick(deal, "vin") ?? "");
  return {
    make,
    model,
    price,
    ...(pick(deal, "year") ? { year: pick(deal, "year") } : {}),
    ...(pick(deal, "trim") ? { trim: pick(deal, "trim") } : {}),
    ...(pick(deal, "mileage") ? { mileage: pick(deal, "mileage") } : {}),
    ...(/^\d{5}$/.test(zip) ? { zip } : {}),
    ...(/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin) ? { vin } : {}),
    ...(category !== "unknown" ? { title: category } : {}),
  };
}
