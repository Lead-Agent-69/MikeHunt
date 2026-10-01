export type BuyerLane =
  | "all"
  | "damaged"
  | "auction"
  | "private"
  | "clean-retail"
  | "government"
  | "parts"
  | "specialty";

export interface BuyerScope {
  q?: string;
  vehicleType?: string;
  lane?: BuyerLane | string;
  state?: string;
  states?: string[];
  make?: string;
  model?: string;
  titleType?: string;
  maxPrice?: number;
  minYear?: number;
  maxMileage?: number;
}

export interface PlannedScrapeScope {
  scope: BuyerScope;
  sourceIds: string[];
  reasons: string[];
  filters: {
    q?: string;
    state?: string;
    states?: string[];
    make?: string;
    model?: string;
    titleType?: string;
  };
}

const LANE_SOURCES: Record<BuyerLane, string[]> = {
  all: [
    "copart",
    "craigslist",
    "ebay_motors",
    "cars_com",
    "autotrader",
    "truecar",
    "carvana",
    "publicsurplus",
    "govdeals",
    "allsurplus",
    "municibid",
    "gsa_auctions",
    "offerup",
    "curated_dealers",
  ],
  damaged: ["copart", "iaa", "curated_dealers"],
  auction: ["copart", "acv", "adesa", "manheim"],
  private: [
    "craigslist",
    "facebook_marketplace",
    "offerup",
    "ebay_motors",
    "curated_dealers",
  ],
  "clean-retail": ["cars_com", "cargurus", "autotrader", "truecar", "carvana"],
  government: [
    "publicsurplus",
    "govdeals",
    "allsurplus",
    "municibid",
    "gsa_auctions",
  ],
  parts: ["carparts_com"],
  specialty: ["ebay_motors", "autotempest", "curated_dealers"],
};

function cleanText(value: unknown, max = 80) {
  if (typeof value !== "string") return undefined;
  const cleaned = value
    .replace(/[^a-zA-Z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
  return cleaned || undefined;
}

function cleanState(value: unknown) {
  if (typeof value !== "string") return undefined;
  const state = value.trim().toUpperCase();
  if (state === "NATIONWIDE" || state === "ALL") return undefined;
  return /^[A-Z]{2}$/.test(state) ? state : undefined;
}

function normalizeLane(value: unknown): BuyerLane {
  const lane = typeof value === "string" ? value.toLowerCase() : "all";
  if (lane === "salvage" || lane === "repairable") return "damaged";
  if (lane === "repo" || lane === "surplus" || lane === "government-surplus")
    return "government";
  if (lane === "retail") return "clean-retail";
  if (lane in LANE_SOURCES) return lane as BuyerLane;
  return "all";
}

export function normalizeBuyerScope(
  input: Record<string, unknown>,
): BuyerScope {
  const states = Array.isArray(input.states)
    ? input.states.map(cleanState).filter(Boolean).slice(0, 12)
    : typeof input.states === "string"
      ? input.states.split(",").map(cleanState).filter(Boolean).slice(0, 12)
      : undefined;

  return {
    q: cleanText(input.q),
    vehicleType: cleanText(input.vehicleType ?? input.vehicle),
    lane: normalizeLane(input.lane),
    state: cleanState(input.state),
    states: states?.length ? (states as string[]) : undefined,
    make: cleanText(input.make, 40),
    model: cleanText(input.model, 40),
    titleType: cleanText(input.titleType, 30),
    maxPrice: Number.isFinite(Number(input.maxPrice))
      ? Number(input.maxPrice)
      : undefined,
    minYear: Number.isFinite(Number(input.minYear))
      ? Number(input.minYear)
      : undefined,
    maxMileage: Number.isFinite(Number(input.maxMileage))
      ? Number(input.maxMileage)
      : undefined,
  };
}

export function planScrapeForBuyerScope(
  input: Record<string, unknown>,
): PlannedScrapeScope {
  const scope = normalizeBuyerScope(input);
  const lane = normalizeLane(scope.lane);
  const q =
    [scope.vehicleType, scope.q].filter(Boolean).join(" ").trim() || undefined;
  const sourceIds = Array.from(new Set(LANE_SOURCES[lane]));
  const reasons = [
    `${lane === "all" ? "broad but capped" : lane} source lane`,
    scope.state || scope.states?.length
      ? "market-limited by location"
      : "nationwide location scope",
    q ? "keyword-limited by buyer intent" : "no keyword filter supplied",
  ];

  return {
    scope: { ...scope, q, lane },
    sourceIds,
    reasons,
    filters: {
      q,
      state: scope.state,
      states: scope.states,
      make: scope.make,
      model: scope.model,
      titleType: scope.titleType,
    },
  };
}
