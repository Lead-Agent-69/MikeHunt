"use client";

import { useCallback, useEffect, useState } from "react";

export const BUYER_INTENT_KEY = "mh_buyer_scope";
export const BUYER_INTENT_EVENT = "mh-buyer-scope-change";

export type BuyerIntent = {
  buyerMode?: BuyerMode;
  vehicle?: string;
  vehicleType?: string;
  lane?: string;
  laneValue?: string;
  state?: string;
  titleType?: string;
  sellerType?: string;
  minPrice?: number;
  maxPrice?: number;
  targetProfit?: number;
  timeline?: "now" | "month" | "research";
  repairCapability?: "none" | "basic" | "advanced";
  preferredMakes?: string[];
  makes?: string[];
  watchedDealers?: string[];
  watchedDealerSourceIds?: string[];
};

export type BuyerMode = "personal" | "diy" | "reseller" | "dealer";

export const BUYER_MODES: Record<
  BuyerMode,
  {
    label: string;
    question: string;
    priorities: string[];
  }
> = {
  personal: {
    label: "Personal buyer",
    question: "Is this a good vehicle for me to own?",
    priorities: [
      "Reliability evidence",
      "Safety",
      "Inspection",
      "Total ownership cost",
    ],
  },
  diy: {
    label: "DIY enthusiast",
    question: "Can I realistically fix this?",
    priorities: [
      "Required skills",
      "Tools and workspace",
      "Parts",
      "Repair uncertainty",
    ],
  },
  reseller: {
    label: "Independent reseller",
    question: "Can I profitably buy and sell this?",
    priorities: [
      "Acquisition cost",
      "Repairs",
      "Resale evidence",
      "Holding time",
    ],
  },
  dealer: {
    label: "Dealer/team",
    question: "Does this fit our business?",
    priorities: [
      "Inventory fit",
      "Local demand",
      "Recon capacity",
      "Capital and turnover",
    ],
  },
};

export function normalizeBuyerMode(value: unknown): BuyerMode | undefined {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (raw === "personal" || raw === "personal-buyer") return "personal";
  if (raw === "diy" || raw === "enthusiast") return "diy";
  if (raw === "reseller" || raw === "independent-reseller") return "reseller";
  if (raw === "dealer" || raw === "team" || raw === "dealer-team") {
    return "dealer";
  }
  return undefined;
}

const VEHICLE_TO_QUERY: Record<string, string> = {
  Trucks: "truck",
  SUVs: "suv",
  Sedans: "sedan",
  Vans: "van",
  Luxury: "luxury",
  Performance: "performance",
  Diesel: "diesel",
  "Hybrid / EV": "hybrid ev",
};

const QUERY_TO_VEHICLE: Record<string, string> = Object.fromEntries(
  Object.entries(VEHICLE_TO_QUERY).map(([label, query]) => [query, label]),
);

const LANE_VALUE_TO_LABEL: Record<string, string> = {
  all: "All deals",
  damaged: "Salvage & repairable",
  auction: "Wholesale auctions",
  private: "Private & retail",
  "clean-retail": "Clean retail",
  government: "Repo / government",
  parts: "Parts / teardown",
  specialty: "Specialty",
};

const LANE_LABEL_TO_VALUE: Record<string, string> = Object.fromEntries(
  Object.entries(LANE_VALUE_TO_LABEL).map(([value, label]) => [label, value]),
);

const LANE_QUERY: Record<string, string> = {
  government: "repo government surplus",
  parts: "parts teardown",
  specialty: "classic collector specialty",
};

function compactStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

export function normalizeBuyerIntent(value: unknown): BuyerIntent | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const maxPrice = Number(raw.maxPrice || 0);
  const minPrice = Number(raw.minPrice || 0);
  const targetProfit = Number(raw.targetProfit || 0);
  const vehicle =
    typeof raw.vehicle === "string"
      ? raw.vehicle
      : typeof raw.vehicleType === "string"
        ? QUERY_TO_VEHICLE[raw.vehicleType] || raw.vehicleType
        : undefined;
  const laneValue =
    typeof raw.laneValue === "string"
      ? raw.laneValue
      : typeof raw.lane === "string"
        ? LANE_LABEL_TO_VALUE[raw.lane] || raw.lane
        : undefined;
  const normalized: BuyerIntent = {
    buyerMode: normalizeBuyerMode(raw.buyerMode || raw.mode),
    vehicle,
    vehicleType:
      typeof raw.vehicleType === "string"
        ? raw.vehicleType
        : vehicle
          ? VEHICLE_TO_QUERY[vehicle] || vehicle
          : undefined,
    lane:
      typeof raw.lane === "string"
        ? raw.lane
        : laneValue
          ? LANE_VALUE_TO_LABEL[laneValue] || laneValue
          : undefined,
    laneValue,
    state: typeof raw.state === "string" ? raw.state : undefined,
    titleType: typeof raw.titleType === "string" ? raw.titleType : undefined,
    sellerType: typeof raw.sellerType === "string" ? raw.sellerType : undefined,
    minPrice: Number.isFinite(minPrice) && minPrice > 0 ? minPrice : undefined,
    maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    targetProfit:
      Number.isFinite(targetProfit) && targetProfit > 0
        ? targetProfit
        : undefined,
    timeline:
      raw.timeline === "now" ||
      raw.timeline === "month" ||
      raw.timeline === "research"
        ? raw.timeline
        : undefined,
    repairCapability:
      raw.repairCapability === "none" ||
      raw.repairCapability === "basic" ||
      raw.repairCapability === "advanced"
        ? raw.repairCapability
        : undefined,
    preferredMakes: compactStrings(raw.preferredMakes),
    makes: compactStrings(raw.makes),
    watchedDealers: compactStrings(raw.watchedDealers),
    watchedDealerSourceIds: compactStrings(raw.watchedDealerSourceIds),
  };
  const hasScope = Boolean(
    normalized.vehicle ||
    normalized.vehicleType ||
    normalized.lane ||
    normalized.laneValue ||
    normalized.state ||
    normalized.titleType ||
    normalized.sellerType ||
    normalized.minPrice ||
    normalized.maxPrice ||
    normalized.targetProfit ||
    normalized.preferredMakes?.length ||
    normalized.makes?.length ||
    normalized.watchedDealers?.length ||
    normalized.watchedDealerSourceIds?.length ||
    normalized.buyerMode,
  );
  return hasScope ? normalized : null;
}

export function readLocalBuyerIntent() {
  if (typeof window === "undefined") return null;
  try {
    return normalizeBuyerIntent(
      JSON.parse(window.localStorage.getItem(BUYER_INTENT_KEY) || "null"),
    );
  } catch {
    return null;
  }
}

export function writeLocalBuyerIntent(intent: BuyerIntent) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    BUYER_INTENT_KEY,
    JSON.stringify(normalizeBuyerIntent(intent) || intent),
  );
  window.dispatchEvent(new Event(BUYER_INTENT_EVENT));
}

export function buildBuyerIntentQuery(
  intent: BuyerIntent | null,
  stateOverride?: string,
) {
  const params = new URLSearchParams();
  const state =
    stateOverride ||
    (intent?.state && intent.state !== "Nationwide" ? intent.state : "");
  const laneValue = intent?.laneValue || "";
  const vehicleQuery =
    intent?.vehicleType ||
    (intent?.vehicle ? VEHICLE_TO_QUERY[intent.vehicle] || intent.vehicle : "");
  const makes = intent?.makes?.length
    ? intent.makes
    : intent?.preferredMakes || [];

  if (state) params.set("state", state);
  if (intent?.buyerMode) params.set("mode", intent.buyerMode);
  if (intent?.minPrice) params.set("minPrice", String(intent.minPrice));
  if (intent?.maxPrice) params.set("maxPrice", String(intent.maxPrice));
  if (laneValue && laneValue !== "all") params.set("lane", laneValue);
  if (intent?.sellerType && intent.sellerType !== "all") {
    params.set("sellerType", intent.sellerType);
  }
  if (intent?.titleType && intent.titleType !== "all") {
    params.set("titleType", intent.titleType);
  }
  if (makes.length) params.set("makes", makes.join(","));
  else if (vehicleQuery) {
    const laneQuery = laneValue ? LANE_QUERY[laneValue] : "";
    params.set("q", [vehicleQuery, laneQuery].filter(Boolean).join(" "));
  }
  if (intent?.watchedDealers?.length) {
    params.set("dealers", intent.watchedDealers.join(","));
  }
  if (intent?.watchedDealerSourceIds?.length) {
    params.set("dealerSourceIds", intent.watchedDealerSourceIds.join(","));
  }
  return params;
}

export function buyerIntentLabel(
  intent: BuyerIntent | null,
  stateOverride?: string,
) {
  const state = stateOverride || intent?.state || "Nationwide";
  const makes = intent?.makes?.length
    ? intent.makes
    : intent?.preferredMakes || [];
  return [
    intent?.buyerMode ? BUYER_MODES[intent.buyerMode].label : "",
    makes.length
      ? makes.slice(0, 3).join("/")
      : intent?.vehicle || "Any vehicle",
    intent?.lane || "All source lanes",
    state,
    intent?.titleType && intent.titleType !== "all"
      ? `${intent.titleType} title`
      : "",
    intent?.sellerType && intent.sellerType !== "all"
      ? `${intent.sellerType} sellers`
      : "",
    intent?.minPrice ? `over $${intent.minPrice.toLocaleString()}` : "",
    intent?.maxPrice ? `under $${intent.maxPrice.toLocaleString()}` : "",
    intent?.watchedDealerSourceIds?.length
      ? `${intent.watchedDealerSourceIds.length} watched dealer${
          intent.watchedDealerSourceIds.length === 1 ? "" : "s"
        }`
      : intent?.watchedDealers?.length
        ? `${intent.watchedDealers.length} watched dealer${
            intent.watchedDealers.length === 1 ? "" : "s"
          }`
        : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function scanHrefForBuyerIntent(intent: BuyerIntent | null) {
  const params = buildBuyerIntentQuery(intent);
  params.set("sort", "profit");
  return `/scan?${params.toString()}`;
}

export function useBuyerIntent(initialIntent?: BuyerIntent | null) {
  const [intent, setIntent] = useState<BuyerIntent | null>(
    normalizeBuyerIntent(initialIntent) || null,
  );

  useEffect(() => {
    const sync = () => setIntent(readLocalBuyerIntent());
    sync();
    window.addEventListener(BUYER_INTENT_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BUYER_INTENT_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = useCallback((next: BuyerIntent) => {
    const normalized = normalizeBuyerIntent(next) || next;
    writeLocalBuyerIntent(normalized);
    setIntent(normalized);
    return normalized;
  }, []);

  return { intent, save };
}
