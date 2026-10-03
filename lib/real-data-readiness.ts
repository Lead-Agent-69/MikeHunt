export type RealDataReadinessStatus = "ready" | "thin" | "stale" | "empty";

export type RealDataReadinessInput = {
  activeDeals: number;
  newestAgeHours: number | null;
  newLast24h: number;
  photoPct: number;
  sourceLinkPct: number;
  pricePct: number;
  titlePct: number;
  damagePct: number;
  mileagePct: number;
  vinPct: number;
  sellerPct: number;
  sellerContactPct: number;
  auctionDatePct: number;
  decisionReady?: boolean;
};

export type RealDataGap = {
  field: string;
  pct: number;
  target: number;
  impact: string;
};

export type RealDataReadiness = {
  status: RealDataReadinessStatus;
  label: string;
  message: string;
  nextAction: string;
  activeDeals: number;
  newestAgeHours: number | null;
  newLast24h: number;
  minimumReady: boolean;
  buyerReady: boolean;
  decisionReady: boolean;
  proof: {
    photoPct: number;
    sourceLinkPct: number;
    pricePct: number;
    titlePct: number;
    damagePct: number;
    mileagePct: number;
    vinPct: number;
    sellerPct: number;
    sellerContactPct: number;
    auctionDatePct: number;
  };
  gaps: RealDataGap[];
};

const FIELD_TARGETS: Array<{
  key: keyof RealDataReadiness["proof"];
  field: string;
  target: number;
  impact: string;
}> = [
  {
    key: "photoPct",
    field: "Photos",
    target: 70,
    impact: "Buyers need visual proof before they trust a listing.",
  },
  {
    key: "sourceLinkPct",
    field: "Original links",
    target: 85,
    impact: "Every serious buyer expects to verify the source listing.",
  },
  {
    key: "pricePct",
    field: "Prices",
    target: 90,
    impact: "Buy/pass ranking is weak without a real ask or bid number.",
  },
  {
    key: "titlePct",
    field: "Title type",
    target: 70,
    impact: "Salvage, rebuilt, clean, and parts-only intent needs title proof.",
  },
  {
    key: "damagePct",
    field: "Condition/damage",
    target: 70,
    impact: "Repair risk is unclear without damage or condition signals.",
  },
  {
    key: "sellerPct",
    field: "Seller/source proof",
    target: 85,
    impact: "Users need to know who owns the car or where it came from.",
  },
  {
    key: "mileagePct",
    field: "Mileage",
    target: 60,
    impact: "Resale estimates stay thin when mileage is missing.",
  },
  {
    key: "vinPct",
    field: "VIN",
    target: 35,
    impact: "VIN coverage unlocks history, decode, recalls, and title checks.",
  },
  {
    key: "sellerContactPct",
    field: "Direct contact",
    target: 35,
    impact: "Dealer/small-shop leads need phone, email, or contact URL.",
  },
  {
    key: "auctionDatePct",
    field: "Auction date",
    target: 35,
    impact: "Auction buyers need timing to act before lots expire.",
  },
];

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function buildRealDataReadiness(
  input: RealDataReadinessInput,
): RealDataReadiness {
  const proof = {
    photoPct: clampPct(input.photoPct),
    sourceLinkPct: clampPct(input.sourceLinkPct),
    pricePct: clampPct(input.pricePct),
    titlePct: clampPct(input.titlePct),
    damagePct: clampPct(input.damagePct),
    mileagePct: clampPct(input.mileagePct),
    vinPct: clampPct(input.vinPct),
    sellerPct: clampPct(input.sellerPct),
    sellerContactPct: clampPct(input.sellerContactPct),
    auctionDatePct: clampPct(input.auctionDatePct),
  };
  const gaps = FIELD_TARGETS.map((target) => ({
    field: target.field,
    pct: proof[target.key],
    target: target.target,
    impact: target.impact,
  }))
    .filter((gap) => gap.pct < gap.target)
    .sort((a, b) => a.pct - b.pct);

  const activeDeals = Math.max(0, Math.round(input.activeDeals || 0));
  const newestAgeHours =
    typeof input.newestAgeHours === "number" &&
    Number.isFinite(input.newestAgeHours)
      ? Math.max(0, Math.round(input.newestAgeHours))
      : null;
  const freshEnough = newestAgeHours != null && newestAgeHours <= 24;
  const minimumReady =
    activeDeals > 0 &&
    freshEnough &&
    proof.photoPct >= 35 &&
    proof.sourceLinkPct >= 50 &&
    proof.pricePct >= 70;
  const buyerReady =
    minimumReady &&
    proof.photoPct >= 70 &&
    proof.sourceLinkPct >= 85 &&
    proof.titlePct >= 70 &&
    proof.damagePct >= 70 &&
    proof.sellerPct >= 85;
  const decisionReady = buyerReady && input.decisionReady === true;

  if (activeDeals === 0) {
    return {
      status: "empty",
      label: "No real inventory yet",
      message:
        "The app is configured, but there are no active rows for users to inspect.",
      nextAction:
        "Run a scoped scan from the buyer's selected vehicle, state, lane, title type, and seller type.",
      activeDeals,
      newestAgeHours,
      newLast24h: Math.max(0, Math.round(input.newLast24h || 0)),
      minimumReady: false,
      buyerReady: false,
      decisionReady: false,
      proof,
      gaps,
    };
  }

  if (!freshEnough) {
    return {
      status: "stale",
      label: "Inventory exists, but freshness is weak",
      message:
        newestAgeHours == null
          ? "Active rows exist, but the newest listing timestamp is missing."
          : `Active rows exist, but the newest listing is ${newestAgeHours}h old.`,
      nextAction:
        "Run the ready sources again and verify recent rows before presenting this as live inventory.",
      activeDeals,
      newestAgeHours,
      newLast24h: Math.max(0, Math.round(input.newLast24h || 0)),
      minimumReady: false,
      buyerReady: false,
      decisionReady: false,
      proof,
      gaps,
    };
  }

  if (!minimumReady || !buyerReady) {
    return {
      status: "thin",
      label: minimumReady
        ? "Usable, but not premium-trust yet"
        : "Real data is thin",
      message: minimumReady
        ? "Users can browse real listings, but the weak fields still force too much manual verification."
        : "The app has real rows, but too many listings are missing photos, source links, or price proof.",
      nextAction: gaps[0]?.field
        ? `Improve ${gaps[0].field.toLowerCase()} coverage first, then rerun source proof.`
        : "Rerun source proof and verify listing detail coverage.",
      activeDeals,
      newestAgeHours,
      newLast24h: Math.max(0, Math.round(input.newLast24h || 0)),
      minimumReady,
      buyerReady: false,
      decisionReady: false,
      proof,
      gaps,
    };
  }

  return {
    status: "ready",
    label: decisionReady
      ? "Decision-ready real data"
      : "Browse-ready real data",
    message: decisionReady
      ? "Fresh active inventory has the core proof and decision evidence needed to support purchase recommendations."
      : "Fresh active inventory has the core proof needed to browse and verify listings. Purchase recommendations remain on hold until decision evidence is available.",
    nextAction: decisionReady
      ? "Keep imports scoped to user preferences and expand the weakest long-tail fields without broad scraping."
      : "Improve decision evidence such as VINs, mileage, sold comps, and verified deal math before presenting purchase recommendations.",
    activeDeals,
    newestAgeHours,
    newLast24h: Math.max(0, Math.round(input.newLast24h || 0)),
    minimumReady: true,
    buyerReady: true,
    decisionReady,
    proof,
    gaps,
  };
}
