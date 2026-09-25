// lib/intelligence/interest-patterns.ts
// The IMPLICIT half of the learning loop. Win-patterns learns from logged profit outcomes (sparse, slow);
// this learns from what a user GRAVITATES toward — saves, watchlist adds, and views (plentiful, immediate).
// So the ecosystem starts learning each user's taste from day one, before enough hard outcomes accumulate.
//
// Weighted by signal strength (a save/watchlist add means more than a glance), attribute-based (make/model
// + price band) so it's explainable and $0 — no embeddings, no AI round-trip. Pure: the caller supplies rows.

export interface InterestSignal {
  make?: string | null;
  model?: string | null;
  price?: number | null;
  source?: string | null;
  weight?: number; // caller sets: saved=3, watchlist=2, viewed=1
  ageDays?: number; // how long ago the signal happened — recent behavior reflects current intent more
}

// Recency decay: a signal's weight halves every ~6 weeks, so what a user saved LAST WEEK outranks what
// they glanced at months ago. Floored so an old signal still counts a little (taste is sticky, not amnesiac).
const RECENCY_HALF_LIFE_DAYS = 45;
function recencyFactor(ageDays?: number): number {
  if (ageDays == null || !Number.isFinite(ageDays) || ageDays <= 0) return 1;
  return Math.max(0.15, Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS));
}

export interface InterestPattern {
  make: string;
  model: string;
  score: number; // summed signal weight — how strongly the user leans to this make/model
  count: number; // distinct signals
  avgPrice: number; // 0 when no priced signals
}

/** Preferred price band (robust central range of what the user engages with) + favored sources. */
export interface InterestProfile {
  patterns: InterestPattern[];
  priceLow: number; // 0 = unknown
  priceHigh: number; // 0 = unknown
  sources: string[]; // sources the user engages with most, strongest first
}

function modelKey(model?: string | null): string {
  return (model || "")
    .toLowerCase()
    .replace(/[\s-]+/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/** Aggregate implicit signals into a ranked interest profile (make/model patterns + price band + sources). */
export function extractInterestProfile(
  signals: InterestSignal[],
): InterestProfile {
  const groups = new Map<
    string,
    {
      make: string;
      model: string;
      score: number;
      count: number;
      prices: number[];
    }
  >();
  const prices: number[] = [];
  const sourceScore = new Map<string, number>();

  for (const s of signals) {
    const base = Number.isFinite(Number(s.weight)) ? Number(s.weight) : 1;
    const w = base * recencyFactor(s.ageDays); // recent signals count for more
    const p = Number(s.price);
    if (Number.isFinite(p) && p > 0) prices.push(p);
    if (s.source)
      sourceScore.set(s.source, (sourceScore.get(s.source) || 0) + w);
    if (!s.make || !s.model) continue;
    const k = `${s.make.toLowerCase()}|${modelKey(s.model)}`;
    if (!groups.has(k))
      groups.set(k, {
        make: s.make,
        model: s.model,
        score: 0,
        count: 0,
        prices: [],
      });
    const g = groups.get(k)!;
    g.score += w;
    g.count += 1;
    if (Number.isFinite(p) && p > 0) g.prices.push(p);
  }

  const patterns = Array.from(groups.values())
    .map((g) => ({
      make: g.make,
      model: g.model,
      score: g.score,
      count: g.count,
      avgPrice: g.prices.length
        ? Math.round(g.prices.reduce((a, b) => a + b, 0) / g.prices.length)
        : 0,
    }))
    .sort((a, b) => b.score - a.score);

  // Robust price band: 10th–90th percentile of engaged prices (ignores the odd outlier click).
  let priceLow = 0;
  let priceHigh = 0;
  if (prices.length >= 3) {
    const sorted = [...prices].sort((a, b) => a - b);
    const at = (q: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    priceLow = Math.round(at(0.1));
    priceHigh = Math.round(at(0.9));
  }

  const sources = Array.from(sourceScore.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);

  return { patterns, priceLow, priceHigh, sources };
}

/** How strongly a candidate matches the learned interest — a 0..1 affinity + the reason. */
export function scoreInterest(
  cand: {
    make?: string | null;
    model?: string | null;
    price?: number | null;
    source?: string | null;
  },
  profile: InterestProfile,
): { affinity: number; reason?: string } {
  if (!profile.patterns.length && !profile.sources.length)
    return { affinity: 0 };
  const mk = (cand.make || "").toLowerCase();
  const md = modelKey(cand.model);
  const maxScore = profile.patterns[0]?.score || 1;

  let affinity = 0;
  let reason: string | undefined;

  // Exact make+model match is the strongest signal.
  const exact = profile.patterns.find(
    (p) => p.make.toLowerCase() === mk && modelKey(p.model) === md,
  );
  if (exact) {
    affinity = Math.max(affinity, 0.6 + 0.4 * (exact.score / maxScore));
    reason = `You keep eyeing ${exact.make} ${exact.model}`;
  } else if (mk) {
    // Same make, different model — a softer signal.
    const sameMake = profile.patterns.find((p) => p.make.toLowerCase() === mk);
    if (sameMake) {
      affinity = Math.max(affinity, 0.35 + 0.25 * (sameMake.score / maxScore));
      reason = reason || `You favor ${sameMake.make}`;
    }
  }

  // Price band fit.
  const price = Number(cand.price);
  if (profile.priceHigh > 0 && Number.isFinite(price) && price > 0) {
    if (price >= profile.priceLow && price <= profile.priceHigh) {
      affinity = Math.max(affinity, Math.min(1, affinity + 0.15) || 0.3);
      reason = reason || "In your usual price range";
    }
  }

  // Source affinity (a light nudge).
  if (cand.source && profile.sources.slice(0, 3).includes(cand.source)) {
    affinity = Math.min(1, affinity + 0.05);
  }

  return { affinity: Math.min(1, affinity), reason };
}
