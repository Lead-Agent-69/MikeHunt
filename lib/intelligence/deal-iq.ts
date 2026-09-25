// lib/intelligence/deal-iq.ts
// Deal IQ — the signal-fusion core. Takes every intelligence signal the platform produces (market
// position, profit, demand, timing, your win-patterns, mispricing, your calibration) and fuses them
// into ONE explainable 0-100 score. Pure function: all DB lookups happen in the route, this just
// reasons over the assembled inputs. The genius is in the data, not in any API call.

export interface IQSignal {
  key: string;
  label: string;
  score: number; // 0-100, this signal's own rating
  weight: number; // relative importance in the blend
  detail: string; // human-readable why
}

export interface DealIQ {
  score: number; // 0-100 weighted blend of present signals
  tier: "elite" | "strong" | "fair" | "weak";
  headline: string;
  signals: IQSignal[];
}

export type Confidence = "high" | "medium" | "low" | "none";

export interface IQInputs {
  askPrice: number;
  sellEstimate?: number | null;
  compsConfidence?: Confidence;
  trueNetProfit?: number | null;
  dealVerdict?: string | null;
  demand?: "high" | "normal" | "soft" | null;
  timing?: "BUY_NOW" | "WAIT" | "NEUTRAL" | null;
  winMatch?: { matched: boolean; avgProfit: number; count: number } | null;
  mispricing?: { pctBelowCluster: number; z: number } | null;
  calibrationProfitBiasPct?: number | null; // signed: + engine under-predicts, - over-predicts
  distress?: boolean;
  // The engine's own gate. A deal it already rejected (verdict "pass") or flagged as a non-real
  // price (financing/lease bait) must never surface as a high-IQ buy, however good the raw signals
  // look — otherwise the IQ chip contradicts the PASS verdict on the same card.
  priceImplausible?: boolean;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function tierFor(score: number): DealIQ["tier"] {
  if (score >= 80) return "elite";
  if (score >= 65) return "strong";
  if (score >= 50) return "fair";
  return "weak";
}

// Confidence multiplier on signals that depend on a trustworthy resale number.
const CONF_FACTOR: Record<Confidence, number> = {
  high: 1,
  medium: 0.9,
  low: 0.75,
  none: 0.55,
};

export function computeDealIQ(inp: IQInputs): DealIQ {
  const signals: IQSignal[] = [];
  const conf = inp.compsConfidence || "none";

  // 1) Market position — how far below resale is the ask, weighted by comps trust.
  const sell = Number(inp.sellEstimate) || 0;
  if (sell > 0 && inp.askPrice > 0) {
    const discount = (sell - inp.askPrice) / sell; // 0.25 = 25% below resale
    const raw = clamp(50 + discount * 160); // 0% -> 50, +25% -> 90, -ve -> below 50
    signals.push({
      key: "market",
      label: "Market position",
      score: clamp(raw * CONF_FACTOR[conf]),
      weight: 3,
      detail: `${Math.round(discount * 100)}% vs resale (${conf} comps)`,
    });
  }

  // 2) Profit — absolute net, adjusted by the dealer's own calibration bias.
  if (inp.trueNetProfit != null) {
    let profit = Number(inp.trueNetProfit);
    const bias = Number(inp.calibrationProfitBiasPct) || 0;
    if (bias < 0) profit = profit * (1 + bias / 100); // engine over-predicts for this dealer -> discount
    const raw = clamp((profit / 6000) * 100); // $6k+ -> 100
    signals.push({
      key: "profit",
      label: "Profit potential",
      score: raw,
      weight: 3,
      detail:
        bias < 0
          ? `~$${Math.round(profit)} net (calibrated to your results)`
          : `~$${Math.round(profit)} net`,
    });
  }

  // 3) Demand — live active-listing scarcity for this make/model.
  if (inp.demand) {
    const map = { high: 82, normal: 55, soft: 32 };
    signals.push({
      key: "demand",
      label: "Demand",
      score: map[inp.demand],
      weight: 1.5,
      detail: `${inp.demand} demand`,
    });
  }

  // 4) Timing — buy-now vs wait from the 30-day price trend.
  if (inp.timing) {
    const map = { BUY_NOW: 75, NEUTRAL: 55, WAIT: 35 };
    signals.push({
      key: "timing",
      label: "Timing",
      score: map[inp.timing],
      weight: 1,
      detail: inp.timing.replace("_", " ").toLowerCase(),
    });
  }

  // 5) Win-match — does this resemble vehicles THIS dealer has actually profited on?
  if (inp.winMatch) {
    if (inp.winMatch.matched) {
      const raw = clamp(65 + Math.min(25, inp.winMatch.count * 5));
      signals.push({
        key: "win",
        label: "Matches your wins",
        score: raw,
        weight: 2,
        detail: `you've averaged ~$${Math.round(inp.winMatch.avgProfit)} on ${inp.winMatch.count} like this`,
      });
    } else {
      signals.push({
        key: "win",
        label: "Matches your wins",
        score: 50,
        weight: 0.5,
        detail: "no track record yet",
      });
    }
  }

  // 6) Mispricing — statistical outlier below its make/model/year cluster.
  if (inp.mispricing && inp.mispricing.z < 0) {
    const raw = clamp(55 + Math.abs(inp.mispricing.pctBelowCluster) * 1.4);
    signals.push({
      key: "mispricing",
      label: "Mispricing",
      score: raw,
      weight: 1.5,
      detail: `${Math.round(Math.abs(inp.mispricing.pctBelowCluster))}% under its peer cluster`,
    });
  }

  // 7) Distress — motivated seller / express-deal signal.
  if (inp.distress) {
    signals.push({
      key: "distress",
      label: "Motivated seller",
      score: 72,
      weight: 0.75,
      detail: "distress / below-book signals",
    });
  }

  // Weighted blend of whatever signals are present (graceful with sparse data).
  const totalW = signals.reduce((s, x) => s + x.weight, 0);
  let score =
    totalW > 0
      ? Math.round(signals.reduce((s, x) => s + x.score * x.weight, 0) / totalW)
      : 50;

  // Respect the engine's own gate so the IQ never contradicts the verdict on the same card:
  //  • implausible price (financing/lease bait, fake $999) → the "discount" is a mirage; hard-floor.
  //  • verdict "pass" → the engine rejected it; cap below "fair".
  //  • verdict "hold" → workable but not a standout; cap below "elite".
  const gated = inp.priceImplausible
    ? Math.min(score, 12)
    : inp.dealVerdict === "pass"
      ? Math.min(score, 45)
      : inp.dealVerdict === "hold"
        ? Math.min(score, 78)
        : score;
  score = gated;

  const tier = tierFor(score);
  const top = [...signals].sort(
    (a, b) => b.score * b.weight - a.score * a.weight,
  )[0];
  const headline = inp.priceImplausible
    ? "Skip — the listed price isn’t a real sale price (looks like a payment/lease)"
    : tier === "elite"
      ? `Elite buy — ${top?.detail || "strong across the board"}`
      : tier === "strong"
        ? `Strong opportunity — ${top?.detail || "good signals"}`
        : tier === "fair"
          ? "Fair — workable but not standout"
          : "Weak — the signals don’t support this one";

  return { score, tier, headline, signals };
}
