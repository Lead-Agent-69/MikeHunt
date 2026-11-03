import {
  catalogForRunnerId,
  IMPLEMENTED_SCRAPER_IDS,
} from "@/lib/scrapers/source-index";

const AUTH_REQUIRED = new Set(["iaa", "acv", "adesa", "manheim"]);
const STEALTH = new Set([
  "iaa",
  "acv",
  "adesa",
  "manheim",
  "facebook_marketplace",
  "cars_com",
  "independent_dealer",
  "cargurus",
  "autotrader",
  "truecar",
  "curated_dealers",
  "offerup",
  "auto_discover",
]);

const META: Record<
  string,
  { name: string; type: string; estimatedDealsPerRun: number }
> = {
  curated_dealers: {
    name: "Curated dealer network",
    type: "dealer",
    estimatedDealsPerRun: 200,
  },
  independent_dealer: {
    name: "Independent dealer network",
    type: "dealer",
    estimatedDealsPerRun: 100,
  },
  auto_discover: {
    name: "Auto Discover Dealer",
    type: "dealer",
    estimatedDealsPerRun: 20,
  },
};

function priority(value?: string) {
  return value === "P0" ? "high" : value === "P1" ? "medium" : "low";
}

function estimate(value: unknown, fallback: number) {
  const parsed = Number(String(value || "").replace(/[^0-9]/g, ""));
  return parsed || fallback;
}

/**
 * Serverless-safe view of the live runner registry. The source-index test keeps
 * IMPLEMENTED_SCRAPER_IDS aligned with runner.ts without importing Playwright.
 */
export function runtimeSourceMetadata() {
  return IMPLEMENTED_SCRAPER_IDS.map((id) => {
    const catalog = catalogForRunnerId(id);
    const meta = META[id];
    const type = meta?.type || catalog?.type || "marketplace";
    const fallbackEstimate = type === "dealer" ? 100 : 200;
    return {
      id,
      name: meta?.name || catalog?.name || id.replace(/[_-]+/g, " "),
      type,
      priority: priority(catalog?.priority),
      enabled: true,
      // Collector authentication is distinct from an account needed to bid/buy.
      requiresAuth: AUTH_REQUIRED.has(id),
      stealthRequired: STEALTH.has(id),
      frequencyMinutes: type === "dealer" ? 720 : type === "auction" ? 360 : 60,
      estimatedDealsPerRun:
        meta?.estimatedDealsPerRun ||
        estimate(catalog?.inventorySize, fallbackEstimate),
    };
  });
}
