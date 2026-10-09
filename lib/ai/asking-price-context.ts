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
  T extends { source?: string | null; ask_price: unknown },
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
      row.ask_price > 0,
  );
}
