import { dealerSourceIdForHost } from "@/lib/sources/source-meta";

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
  makes?: string[];
  model?: string;
  titleType?: string;
  sellerType?: string;
  minPrice?: number;
  maxPrice?: number;
  minYear?: number;
  maxMileage?: number;
  dealerSourceIds?: string[];
  dealerHosts?: string[];
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
    makes?: string[];
    model?: string;
    titleType?: string;
    minPrice?: number;
    maxPrice?: number;
  };
}

export interface BuyerScopeLinks {
  scanHref: string;
  proofRankedHref: string;
  sourceHealthHref: string;
  sourceSetupHref: string;
  scopeLabel: string;
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

const SELLER_TYPE_SOURCES: Record<string, string[]> = {
  dealer: ["curated_dealers"],
  auction: [
    "copart",
    "acv",
    "adesa",
    "manheim",
    "publicsurplus",
    "govdeals",
    "allsurplus",
    "municibid",
    "gsa_auctions",
  ],
  private: ["craigslist", "facebook_marketplace", "offerup", "ebay_motors"],
};

export const CURATED_DEALER_SOURCE_IDS = [
  "stjames-auto",
  "dg-auto",
  "recar",
  "ae-of-miami",
  "damage-com",
  "cas-miami",
  "salvagezone",
  "rebuilt-auto",
  "alpine-auto",
  "replica-auto",
];

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

function cleanSellerType(value: unknown) {
  if (typeof value !== "string") return undefined;
  const sellerType = value.trim().toLowerCase();
  if (!sellerType || sellerType === "all") return undefined;
  return SELLER_TYPE_SOURCES[sellerType] ? sellerType : undefined;
}

function sourceIdsForSellerType(sellerType?: string) {
  return sellerType ? SELLER_TYPE_SOURCES[sellerType] || null : null;
}

function cleanDealerHost(value: unknown) {
  if (typeof value !== "string") return undefined;
  const host = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .replace(/[^a-z0-9.-]/g, "");
  return host || undefined;
}

function cleanDealerSourceId(value: unknown) {
  if (typeof value !== "string") return undefined;
  const id = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
  return CURATED_DEALER_SOURCE_IDS.includes(id) ? id : undefined;
}

function normalizeDealerHosts(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(new Set(raw.map(cleanDealerHost).filter(Boolean))).slice(
    0,
    25,
  ) as string[];
}

function normalizeDealerSourceIds(value: unknown, dealerHosts: string[]) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const direct = raw.map(cleanDealerSourceId).filter(Boolean) as string[];
  const fromHosts = dealerHosts
    .map((host) => dealerSourceIdForHost(host))
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set([...direct, ...fromHosts])).slice(0, 25);
}

function composeBuyerQuery(...values: Array<string | undefined>) {
  const tokens = new Set<string>();
  const words: string[] = [];
  for (const value of values) {
    for (const word of (value || "").split(/\s+/)) {
      const key = word.toLowerCase();
      if (!key || tokens.has(key)) continue;
      tokens.add(key);
      words.push(word);
    }
  }
  return words.join(" ").trim() || undefined;
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

function appendScopeParams(params: URLSearchParams, scope: BuyerScope) {
  const q = composeBuyerQuery(scope.vehicleType, scope.q);
  const lane = normalizeLane(scope.lane);
  if (q) params.set("q", q);
  if (lane !== "all") params.set("lane", lane);
  if (scope.titleType && scope.titleType !== "all") {
    params.set("titleType", scope.titleType);
  }
  if (scope.sellerType) params.set("sellerType", scope.sellerType);
  if (scope.state) params.set("state", scope.state);
  if (scope.states?.length) params.set("states", scope.states.join(","));
  if (scope.make) params.set("make", scope.make);
  if (scope.makes?.length) params.set("makes", scope.makes.join(","));
  if (scope.model) params.set("model", scope.model);
  if (scope.minPrice) params.set("minPrice", String(scope.minPrice));
  if (scope.maxPrice) params.set("maxPrice", String(scope.maxPrice));
  if (scope.minYear) params.set("minYear", String(scope.minYear));
  if (scope.maxMileage) params.set("maxMileage", String(scope.maxMileage));
  if (scope.dealerHosts?.length) {
    params.set("dealers", scope.dealerHosts.join(","));
  }
  if (scope.dealerSourceIds?.length) {
    params.set("dealerSourceIds", scope.dealerSourceIds.join(","));
  }
}

export function buildBuyerScopeLinks(
  input: Record<string, unknown> | BuyerScope,
): BuyerScopeLinks {
  const scope = normalizeBuyerScope(input as Record<string, unknown>);
  const lane = normalizeLane(scope.lane);
  const q = composeBuyerQuery(scope.vehicleType, scope.q);
  const scanParams = new URLSearchParams();
  appendScopeParams(scanParams, scope);
  scanParams.set("sort", "profit");

  const proofParams = new URLSearchParams(scanParams);
  proofParams.set("sort", "score");
  proofParams.set("review", "fresh-import");

  const sourceParams = new URLSearchParams();
  appendScopeParams(sourceParams, scope);

  const labelParts = [
    q || "all vehicles",
    lane === "all" ? "all lanes" : lane.replace("-", " "),
    scope.state || scope.states?.join(", ") || "nationwide",
    scope.minPrice ? `over $${Number(scope.minPrice).toLocaleString()}` : null,
    scope.maxPrice ? `under $${Number(scope.maxPrice).toLocaleString()}` : null,
    scope.sellerType ? `${scope.sellerType} sellers` : null,
    scope.makes?.length ? `${scope.makes.length} make focus` : null,
    scope.dealerSourceIds?.length
      ? `${scope.dealerSourceIds.length} selected dealer${
          scope.dealerSourceIds.length === 1 ? "" : "s"
        }`
      : scope.dealerHosts?.length
        ? `${scope.dealerHosts.length} watched dealer${
            scope.dealerHosts.length === 1 ? "" : "s"
          }`
        : null,
  ].filter(Boolean);

  return {
    scanHref: `/scan?${scanParams.toString()}`,
    proofRankedHref: `/scan?${proofParams.toString()}`,
    sourceHealthHref: `/api/scrape/health${
      sourceParams.toString() ? `?${sourceParams.toString()}` : ""
    }`,
    sourceSetupHref: `/sources${
      sourceParams.toString() ? `?${sourceParams.toString()}` : ""
    }`,
    scopeLabel: labelParts.join(" · "),
  };
}

export function normalizeBuyerScope(
  input: Record<string, unknown>,
): BuyerScope {
  const states = Array.isArray(input.states)
    ? input.states.map(cleanState).filter(Boolean).slice(0, 12)
    : typeof input.states === "string"
      ? input.states.split(",").map(cleanState).filter(Boolean).slice(0, 12)
      : undefined;
  const dealerHosts = normalizeDealerHosts(input.dealerHosts);
  const dealerSourceIds = normalizeDealerSourceIds(
    input.dealerSourceIds,
    dealerHosts,
  );
  const rawMakes = Array.isArray(input.makes)
    ? input.makes
    : Array.isArray(input.preferredMakes)
      ? input.preferredMakes
      : typeof input.makes === "string"
        ? input.makes.split(",")
        : typeof input.preferredMakes === "string"
          ? input.preferredMakes.split(",")
          : [];
  const makes = Array.from(
    new Set(rawMakes.map((value) => cleanText(value, 40)).filter(Boolean)),
  ).slice(0, 12) as string[];

  return {
    q: cleanText(input.q),
    vehicleType: cleanText(input.vehicleType ?? input.vehicle),
    lane: normalizeLane(input.lane),
    state: cleanState(input.state),
    states: states?.length ? (states as string[]) : undefined,
    make: cleanText(input.make, 40),
    makes: makes.length ? makes : undefined,
    model: cleanText(input.model, 40),
    titleType: cleanText(input.titleType, 30),
    sellerType: cleanSellerType(input.sellerType),
    minPrice: Number.isFinite(Number(input.minPrice))
      ? Number(input.minPrice)
      : undefined,
    maxPrice: Number.isFinite(Number(input.maxPrice))
      ? Number(input.maxPrice)
      : undefined,
    minYear: Number.isFinite(Number(input.minYear))
      ? Number(input.minYear)
      : undefined,
    maxMileage: Number.isFinite(Number(input.maxMileage))
      ? Number(input.maxMileage)
      : undefined,
    dealerHosts: dealerHosts.length ? dealerHosts : undefined,
    dealerSourceIds: dealerSourceIds.length ? dealerSourceIds : undefined,
  };
}

export function planScrapeForBuyerScope(
  input: Record<string, unknown>,
): PlannedScrapeScope {
  const scope = normalizeBuyerScope(input);
  const lane = normalizeLane(scope.lane);
  const q = composeBuyerQuery(scope.vehicleType, scope.q);
  const laneSourceIds = Array.from(new Set(LANE_SOURCES[lane]));
  const sellerSourceIds = sourceIdsForSellerType(scope.sellerType);
  const sourceIds = scope.dealerSourceIds?.length
    ? ["curated_dealers"]
    : sellerSourceIds
      ? lane === "all"
        ? sellerSourceIds
        : laneSourceIds.filter((sourceId) => sellerSourceIds.includes(sourceId))
      : laneSourceIds;
  const reasons = [
    `${lane === "all" ? "broad but capped" : lane} source lane`,
    scope.sellerType
      ? `${scope.sellerType} seller type`
      : "all seller types allowed",
    scope.state || scope.states?.length
      ? "market-limited by location"
      : "nationwide location scope",
    q ? "keyword-limited by buyer intent" : "no keyword filter supplied",
    scope.dealerSourceIds?.length
      ? "limited to watched dealer targets"
      : "no watched dealer target supplied",
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
      makes: scope.makes,
      model: scope.model,
      titleType: scope.titleType,
      minPrice: scope.minPrice,
      maxPrice: scope.maxPrice,
    },
  };
}

export function resolveBuyerSourceRequest(
  requestedSourceIds: string[],
  allowedSourceIds: string[],
) {
  const allowed = new Set(allowedSourceIds);
  const curatedDealerSet = new Set(CURATED_DEALER_SOURCE_IDS);
  const sourceIds: string[] = [];
  const mismatchedSourceIds: string[] = [];
  const dealerSourceIds: string[] = [];

  for (const id of requestedSourceIds) {
    if (allowed.has(id)) {
      sourceIds.push(id);
      continue;
    }

    if (curatedDealerSet.has(id) && allowed.has("curated_dealers")) {
      sourceIds.push("curated_dealers");
      dealerSourceIds.push(id);
      continue;
    }

    mismatchedSourceIds.push(id);
  }

  return {
    sourceIds: Array.from(new Set(sourceIds)),
    mismatchedSourceIds,
    dealerSourceIds: Array.from(new Set(dealerSourceIds)),
  };
}
