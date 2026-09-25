// lib/scoring/deal-categories.ts
//
// Browsable one-tap lead categories for the car scan/discover UI — the cars twin of lib/housing/categories.
// Each is a distinguishing, money-relevant slice a flipper actually hunts by (not the whole inventory), so
// the chips only surface when there are matches. Computed from fields already on the scan Deal — no I/O.

export interface CarLike {
  askPrice?: number | null;
  sellEstimate?: number | null;
  true_net_profit?: number | null;
  dealVerdict?: string | null;
  condition?: string | null;
  damageType?: string | null;
  source?: string | null;
  mileage?: number | null;
  year?: number | null;
}

const AUCTION_SOURCES = new Set([
  "copart",
  "iaa",
  "manheim",
  "adesa",
  "acv",
  "publicsurplus",
  "govdeals",
  "gsa",
  "municibid",
  "govplanet",
  "purplewave",
]);

const isSalvage = (d: CarLike) =>
  /salvage|rebuilt|parts|flood|wrecked|repairable|non[- ]?run/.test(
    `${d.condition || ""} ${d.damageType || ""}`.toLowerCase(),
  );

export interface DealCategory {
  key: string;
  label: string;
  match: (d: CarLike) => boolean;
}

export const CAR_CATEGORIES: DealCategory[] = [
  {
    // Engine-rated BUY with a real, meaningful net profit.
    key: "high_margin",
    label: "🔥 High margin",
    match: (d) => (d.true_net_profit ?? 0) >= 3000,
  },
  {
    // Asking well under our resale estimate — priced below market.
    key: "below_market",
    label: "🎯 Below market",
    match: (d) =>
      (d.sellEstimate ?? 0) > 0 &&
      (d.askPrice ?? 0) > 0 &&
      (d.askPrice as number) <= (d.sellEstimate as number) * 0.85,
  },
  {
    // Damaged/salvage title the engine still rates a BUY — the rehab-flipper's bread and butter.
    key: "salvage_steal",
    label: "🔧 Salvage steal",
    match: (d) => isSalvage(d) && d.dealVerdict === "go",
  },
  {
    // Auction/wholesale channels — bought below retail (the classic arbitrage).
    key: "auction",
    label: "🏦 Auction",
    match: (d) => AUCTION_SOURCES.has((d.source || "").toLowerCase()),
  },
  {
    // Low mileage for the age (< ~10k mi/yr) — holds value, moves fast.
    key: "low_miles",
    label: "📉 Low miles",
    match: (d) => {
      if (!d.year || !d.mileage || d.mileage <= 0) return false;
      const age = Math.max(1, new Date().getFullYear() - d.year + 1);
      return d.mileage < age * 10000;
    },
  },
];

/** The category keys a deal belongs to (for chip filtering). */
export function carCategories(d: CarLike): string[] {
  return CAR_CATEGORIES.filter((c) => c.match(d)).map((c) => c.key);
}
