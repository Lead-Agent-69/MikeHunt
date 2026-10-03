import type {
  BuyerScope,
  BuyerScopeLinks,
  PlannedScrapeScope,
} from "./buyer-scope";

const PROOF_FIELDS = [
  "photos",
  "vin",
  "title",
  "mileage",
  "damage",
  "price",
  "seller",
  "sellerContact",
  "auctionDate",
  "sourceLink",
  "lastSeen",
] as const;

function compactValues(values: Array<string | number | undefined | null>) {
  return values
    .map((value) =>
      typeof value === "string"
        ? value.trim()
        : value == null
          ? ""
          : String(value),
    )
    .filter(Boolean);
}

function scopeSummary(scope: BuyerScope) {
  return compactValues([
    scope.lane && scope.lane !== "all" ? `${scope.lane} lane` : "all lanes",
    scope.state ||
      (scope.states?.length ? scope.states.join("/") : "nationwide"),
    scope.vehicleType || scope.q || "all vehicles",
    scope.titleType && scope.titleType !== "all"
      ? `${scope.titleType} title`
      : undefined,
    scope.sellerType ? `${scope.sellerType} sellers` : undefined,
    scope.makes?.length ? `${scope.makes.join("/")} makes` : scope.make,
    scope.model,
    scope.minPrice
      ? `over $${Number(scope.minPrice).toLocaleString()}`
      : undefined,
    scope.maxPrice
      ? `under $${Number(scope.maxPrice).toLocaleString()}`
      : undefined,
    scope.dealerSourceIds?.length
      ? `${scope.dealerSourceIds.length} watched dealer${
          scope.dealerSourceIds.length === 1 ? "" : "s"
        }`
      : undefined,
  ]).join(" · ");
}

export function buildImportContract({
  plan,
  links,
  sourceIds,
  runnableCount,
  heldBackCount,
  mismatchedSourceIds = [],
  dealerSourceIds = [],
  canImport,
}: {
  plan: PlannedScrapeScope | null;
  links: BuyerScopeLinks | null;
  sourceIds: string[];
  runnableCount: number;
  heldBackCount: number;
  mismatchedSourceIds?: string[];
  dealerSourceIds?: string[];
  canImport?: boolean;
}) {
  const scope = plan?.scope || {};
  const filters = plan?.filters || {};
  const allowedFilters = {
    lane: scope.lane || "all",
    state: filters.state || scope.state || null,
    states: filters.states || scope.states || [],
    q: filters.q || scope.q || scope.vehicleType || null,
    titleType: filters.titleType || scope.titleType || null,
    sellerType: scope.sellerType || null,
    make: filters.make || scope.make || null,
    makes: filters.makes || scope.makes || [],
    model: filters.model || scope.model || null,
    minPrice: scope.minPrice || null,
    maxPrice: scope.maxPrice || null,
    dealerSourceIds,
    dealerHosts: scope.dealerHosts || [],
  };
  const scopeLabel = links?.scopeLabel || scopeSummary(scope);
  const proofFields = [...PROOF_FIELDS];

  return {
    scopeLabel,
    canImport: Boolean(canImport),
    sourceIds,
    runnableCount,
    heldBackCount,
    allowedFilters,
    proofFields,
    guardrails: [
      "Run only sources that match the selected buyer lane.",
      "Preserve selected state, make, model, title, seller type, budget, and dealer targets.",
      "Hold back mismatched or gated sources instead of broad fallback scraping.",
      "Review fresh rows with source proof before bidding or contacting a seller.",
    ],
    heldBackSourceIds: mismatchedSourceIds,
    dealerSourceIds,
    expectedUserPath: links
      ? [
          {
            label: "Preview source proof",
            href: links.sourceSetupHref,
          },
          {
            label: "Search selected sources",
            href: "/api/scrape/run",
          },
          {
            label: "Review proof-ranked rows",
            href: links.proofRankedHref,
          },
        ]
      : [],
    summary:
      runnableCount > 0
        ? `${runnableCount} matching source${
            runnableCount === 1 ? "" : "s"
          } can run for ${scopeLabel}. ${heldBackCount} held back.`
        : `No matching source can run for ${scopeLabel || "this scope"} yet. ${heldBackCount} held back.`,
  };
}
