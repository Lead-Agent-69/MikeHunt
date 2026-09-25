// lib/intelligence/predict.ts
//
// The PREDICTIVE layer — turns the engine from "what's cheap right now" into "what's about to happen."
// Pure + $0 (no AI, no API): every signal is derived from data we already harvest — days-on-market,
// price-drop history, live comp supply (scarcity), and the deal's own margin. Four forecasts per listing:
//   • time-to-sell / velocity  — how fast this market clears (scarce supply → fast)
//   • price-drop likelihood     — will the seller cut soon? (stale + overpriced → yes)
//   • urgency                   — should you act NOW? (a fresh BUY in a fast market gets grabbed)
//   • projected ROI             — return at the actionable price
// Deliberately explainable: each number carries a human `reason`, so it reads like judgment, not a black box.

export interface Prediction {
  daysToSell: number | null; // estimated days on market before it sells
  velocity: "fast" | "normal" | "slow" | "unknown";
  priceDropChance: number | null; // 0..1 — probability of a price cut in ~2 weeks
  urgency: "act_now" | "soon" | "watch" | "none";
  projectedRoiPct: number | null; // return at the actionable cost
  reasons: string[];
}

export interface PredictInput {
  daysOnMarket?: number | null; // how long it's been listed
  priceVsMarket?: number | null; // ask / market median (>1 = above market)
  marketSupply?: number | null; // # of live comparable listings (scarcity signal)
  priceDrops?: number | null; // price cuts already seen on this listing
  netProfit?: number | null; // estimated net profit
  cost?: number | null; // actionable acquisition cost (max bid / ask)
  isBuy?: boolean; // engine verdict is BUY
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

// Scarcity → speed. A base clearing time bent by how many comparable listings are live: few = it moves,
// flooded = it sits. Anchored to a ~25-day base (typical used-car/off-market cadence).
function estimateDaysToSell(supply?: number | null): number | null {
  if (supply == null || !Number.isFinite(supply)) return null;
  const factor = supply < 8 ? 0.4 : supply < 25 ? 0.7 : supply < 80 ? 1 : 1.5;
  return Math.round(clamp(25 * factor, 3, 90));
}

function velocityOf(days: number | null): Prediction["velocity"] {
  if (days == null) return "unknown";
  return days <= 12 ? "fast" : days <= 35 ? "normal" : "slow";
}

// Will the seller cut soon? Rises with time-on-market (patience runs out) and with how far ABOVE market
// the ask is (overpriced listings that don't move get cut). A prior cut means a motivated, still-moving
// seller → nudge up. Below-market listings rarely drop.
function priceDropChance(input: PredictInput): number | null {
  const { daysOnMarket: dom, priceVsMarket: pvm, priceDrops } = input;
  if (dom == null && pvm == null) return null;
  let p =
    dom == null
      ? 0.15
      : dom < 14
        ? 0.1
        : dom < 30
          ? 0.25
          : dom < 60
            ? 0.45
            : 0.65;
  if (pvm != null) {
    if (pvm >= 1.25) p += 0.3;
    else if (pvm >= 1.1) p += 0.18;
    else if (pvm <= 0.92) p -= 0.12; // already a good price → less likely to cut
  }
  if ((priceDrops ?? 0) > 0) p += 0.12; // already cut once → cuts again
  return Math.round(clamp(p, 0.03, 0.92) * 100) / 100;
}

export function predict(input: PredictInput): Prediction {
  const reasons: string[] = [];
  const daysToSell = estimateDaysToSell(input.marketSupply);
  const velocity = velocityOf(daysToSell);
  const dropChance = priceDropChance(input);
  const dom = input.daysOnMarket ?? null;

  const projectedRoiPct =
    input.netProfit != null && input.cost != null && input.cost > 0
      ? Math.round((input.netProfit / input.cost) * 1000) / 10
      : null;

  // Urgency = a fresh BUY in a fast, scarce market that others will grab first.
  let urgency: Prediction["urgency"] = "none";
  if (input.isBuy) {
    const fresh = dom == null || dom <= 7;
    if (velocity === "fast" && fresh) urgency = "act_now";
    else if (velocity === "fast" || fresh) urgency = "soon";
    else urgency = "watch";
  }

  // Explainable narration.
  if (daysToSell != null)
    reasons.push(
      velocity === "fast"
        ? `Sells fast — ~${daysToSell}d (scarce supply)`
        : velocity === "slow"
          ? `Slow market — ~${daysToSell}d to clear`
          : `~${daysToSell}d to sell`,
    );
  if (dropChance != null && dropChance >= 0.5)
    reasons.push(`${Math.round(dropChance * 100)}% likely to drop price soon`);
  if (urgency === "act_now")
    reasons.push("Act now — a fresh deal in a fast market won't last");
  if (projectedRoiPct != null)
    reasons.push(`Projected ROI ${projectedRoiPct}%`);

  return {
    daysToSell,
    velocity,
    priceDropChance: dropChance,
    urgency,
    projectedRoiPct,
    reasons,
  };
}
