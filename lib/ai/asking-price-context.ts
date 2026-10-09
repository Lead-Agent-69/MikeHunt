import { hasReportedRepairRisk } from "@/lib/intelligence/repair-risk";

const ASKING_SOURCES = new Set([
  "independent_dealer",
  "craigslist",
  "craigslist_dealer",
  "facebook_marketplace",
  "offerup",
  "carmax",
  "cars_com",
  "cargurus",
  "autotrader",
  "truecar",
  "carvana",
  "vroom",
]);

/** Auction/mixed/unknown channels cannot supply retail asking-price context. */
export function eligibleAskingPrices<
  T extends {
    source?: string | null;
    ask_price: unknown;
    source_url?: string | null;
    condition?: string | null;
    damage_type?: string | null;
    title?: string | null;
    mileage?: number | null;
    auction_end_at?: string | null;
  },
>(rows: T[]): T[] {
  return rows.filter(
    (row) =>
      ASKING_SOURCES.has(
        String(row.source || "")
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_"),
      ) &&
      typeof row.ask_price === "number" &&
      Number.isFinite(row.ask_price) &&
      row.ask_price > 0 &&
      typeof row.mileage === "number" &&
      Number.isFinite(row.mileage) &&
      row.mileage > 0 &&
      !!row.condition &&
      !["unknown", "unlisted"].includes(row.condition.toLowerCase()) &&
      !hasReportedRepairRisk(row.condition, row.damage_type) &&
      !/salvage|rebuilt|total[-_ ]?loss|parts[-_ ]?only/i.test(
        row.title || "",
      ) &&
      !row.auction_end_at &&
      isRetailListingUrl(row.source_url),
  );
}

function isRetailListingUrl(value?: string | null): boolean {
  try {
    const url = new URL(value || "");
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !/auction|copart|iaai|salvage|autobidmaster|bid\.cars/i.test(
        url.hostname,
      ) &&
      !/\/(auction|lot|bid)(\/|$)/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}
