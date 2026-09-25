// lib/scoring/max-bid.ts
// Inverse of the engine's forward cost build-up: given a resale estimate, a target profit, and the
// known per-vehicle costs, solve for the most a dealer can bid at auction and still hit that profit.
// Pure functions — shared by the MaxBidWidget UI and the /api/deal/max-bid route.

export interface MaxBidCosts {
  acquisition?: number | null;
  repair?: number | null;
  transport?: number | null;
  holding?: number | null;
  selling?: number | null;
  total?: number | null;
}

export interface FeeModel {
  feeRate: number; // % of bid charged as a buyer fee
  flatFee: number; // flat buyer/admin fee
  titleFee: number; // title/doc fee
}

// Auction fee model, inverted from the engine's forward cost build-up.
export function feeModel(source?: string | null): FeeModel {
  const s = (source || "").toLowerCase();
  if (s.includes("copart") || s.includes("iaa")) {
    return { feeRate: 0.1, flatFee: 130, titleFee: 100 };
  }
  if (s.includes("manheim") || s.includes("adesa") || s.includes("acv")) {
    return { feeRate: 0, flatFee: 600, titleFee: 100 };
  }
  return { feeRate: 0, flatFee: 0, titleFee: 0 };
}

export interface MaxBidInput {
  sellEstimate?: number | null;
  targetProfit?: number | null;
  costs?: MaxBidCosts | null;
  source?: string | null;
}

export interface MaxBidResult {
  maxBid: number;
  marginPct: number; // implied ROI = profit / invested cost basis
  viable: boolean; // a positive max bid is achievable
  breakdown: {
    sellEstimate: number;
    targetProfit: number;
    fixedCosts: number; // repair + transport + holding + selling
    auctionFees: number; // flat + title fees (fee rate excluded — it scales with the bid)
    feeRate: number;
    maxBid: number;
  };
}

// Sum the non-acquisition costs (everything except the bid itself).
function fixedNonAcquisition(costs?: MaxBidCosts | null): number {
  const c = costs || {};
  return (
    (Number(c.repair) || 0) +
    (Number(c.transport) || 0) +
    (Number(c.holding) || 0) +
    (Number(c.selling) || 0)
  );
}

export function computeMaxBid({
  sellEstimate,
  targetProfit,
  costs,
  source,
}: MaxBidInput): MaxBidResult {
  const sell = Number(sellEstimate) || 0;
  const profit = Number(targetProfit) || 0;
  const fixed = fixedNonAcquisition(costs);
  const { feeRate, flatFee, titleFee } = feeModel(source);

  const maxTotalCost = sell - profit;
  const maxAcquisition = maxTotalCost - fixed;
  const maxBid = Math.max(
    0,
    Math.round((maxAcquisition - flatFee - titleFee) / (1 + feeRate)),
  );

  // Implied ROI = profit / total invested cost basis.
  const investedBasis = Math.max(1, sell - profit);
  const marginPct = sell > 0 ? Math.round((profit / investedBasis) * 100) : 0;

  return {
    maxBid,
    marginPct,
    viable: maxBid > 0,
    breakdown: {
      sellEstimate: sell,
      targetProfit: profit,
      fixedCosts: fixed,
      auctionFees: flatFee + titleFee,
      feeRate,
      maxBid,
    },
  };
}
