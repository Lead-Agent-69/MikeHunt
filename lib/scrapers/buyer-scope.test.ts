import { describe, expect, it } from "vitest";
import {
  buildBuyerScopeLinks,
  normalizeBuyerScope,
  planScrapeForBuyerScope,
  resolveBuyerSourceRequest,
} from "./buyer-scope";

describe("buyer scope planning", () => {
  it("strips operator-only refresh controls from public buyer scope", () => {
    const scope = normalizeBuyerScope({
      state: "MO",
      refreshExisting: true,
    });

    expect(scope).toMatchObject({ state: "MO", lane: "all" });
    expect(scope).not.toHaveProperty("refreshExisting");
  });

  it("keeps retail aggregators eligible for all-lane state searches without widening location", () => {
    const plan = planScrapeForBuyerScope({
      lane: "all",
      state: "MO",
      make: "Ford",
      maxPrice: 20000,
    });
    expect(plan.sourceIds).toContain("cargurus");
    expect(plan.sourceIds).toContain("autotempest");
    expect(plan.filters).toMatchObject({
      state: "MO",
      make: "Ford",
      maxPrice: 20000,
    });
    expect(plan.scope.states).toBeUndefined();
  });
  it("carries repair eligibility through the plan and navigation links", () => {
    const plan = planScrapeForBuyerScope({ includeRepairable: false });
    expect(plan.scope.includeRepairable).toBe(false);
    expect(buildBuyerScopeLinks(plan.scope).scanHref).toContain(
      "includeRepairable=0",
    );
  });
  it("limits damaged searches to salvage/dealer sources", () => {
    const plan = planScrapeForBuyerScope({
      vehicleType: "suv",
      lane: "damaged",
      state: "FL",
      titleType: "salvage",
      minPrice: 5000,
      maxPrice: 10000,
    });

    expect(plan.sourceIds).toContain("copart");
    expect(plan.sourceIds).toContain("curated_dealers");
    expect(plan.sourceIds).not.toContain("govdeals");
    expect(plan.scope.q).toBe("suv");
    expect(plan.filters.state).toBe("FL");
    expect(plan.scope.minPrice).toBe(5000);
    expect(plan.filters.minPrice).toBe(5000);
    expect(plan.filters.maxPrice).toBe(10000);
  });

  it("dedupes repeated buyer intent terms", () => {
    const plan = planScrapeForBuyerScope({
      vehicleType: "mercedes",
      q: "mercedes c class",
      lane: "government",
      state: "FL",
    });

    expect(plan.scope.q).toBe("mercedes c class");
    expect(plan.filters.q).toBe("mercedes c class");
  });

  it("carries multi-make focus into scope filters and generated links", () => {
    const plan = planScrapeForBuyerScope({
      vehicleType: "suv",
      lane: "damaged",
      state: "FL",
      makes: ["Toyota", "Honda", "Toyota"],
      minPrice: 5000,
    });
    const links = buildBuyerScopeLinks(plan.scope);

    expect(plan.scope.makes).toEqual(["Toyota", "Honda"]);
    expect(plan.filters.makes).toEqual(["Toyota", "Honda"]);
    expect(links.scanHref).toContain("makes=Toyota%2CHonda");
    expect(links.scanHref).toContain("minPrice=5000");
    expect(links.sourceHealthHref).toContain("makes=Toyota%2CHonda");
    expect(links.sourceHealthHref).toContain("minPrice=5000");
    expect(links.scopeLabel).toContain("2 make focus");
    expect(links.scopeLabel).toContain("from $5,000");
  });

  it("routes named curated dealers through the curated dealer runner", () => {
    const plan = planScrapeForBuyerScope({
      vehicleType: "suv",
      lane: "damaged",
      state: "FL",
    });

    const resolved = resolveBuyerSourceRequest(
      ["ae-of-miami", "damage-com"],
      plan.sourceIds,
    );

    expect(resolved.sourceIds).toEqual(["curated_dealers"]);
    expect(resolved.dealerSourceIds).toEqual(["ae-of-miami", "damage-com"]);
    expect(resolved.mismatchedSourceIds).toEqual([]);
  });

  it("maps watched dealer hosts into curated dealer targets", () => {
    const plan = planScrapeForBuyerScope({
      lane: "government",
      dealerHosts: "aeofmiami.com,stjamesautoparts.com",
    });

    expect(plan.sourceIds).toEqual(["curated_dealers"]);
    expect(plan.scope.dealerHosts).toEqual([
      "aeofmiami.com",
      "stjamesautoparts.com",
    ]);
    expect(plan.scope.dealerSourceIds).toEqual(["ae-of-miami", "stjames-auto"]);
    expect(plan.reasons).toContain("limited to watched dealer targets");
    expect(buildBuyerScopeLinks(plan.scope).scopeLabel).toContain(
      "2 selected dealers",
    );
  });

  it("holds unrelated sources back instead of widening the scan", () => {
    const plan = planScrapeForBuyerScope({
      vehicleType: "truck",
      lane: "government",
      state: "TX",
    });

    const resolved = resolveBuyerSourceRequest(
      ["copart", "govdeals"],
      plan.sourceIds,
    );

    expect(resolved.sourceIds).toEqual(["govdeals"]);
    expect(resolved.mismatchedSourceIds).toEqual(["copart"]);
  });

  it("uses seller type to keep all-lane dealer scans dealer-only", () => {
    const plan = planScrapeForBuyerScope({
      vehicleType: "suv",
      lane: "all",
      sellerType: "dealer",
    });

    expect(plan.scope.sellerType).toBe("dealer");
    expect(plan.sourceIds).toContain("curated_dealers");
    expect(plan.sourceIds).toContain("cars_com");
    expect(plan.sourceIds).toContain("craigslist");
    expect(plan.sourceIds).not.toContain("copart");
    expect(plan.reasons).toContain("dealer seller type");
  });

  it("includes local dealers in clean-retail searches without adding salvage auctions", () => {
    const plan = planScrapeForBuyerScope({
      lane: "clean-retail",
      state: "MO",
      vehicleType: "Any vehicle",
    });
    expect(plan.sourceIds).toContain("curated_dealers");
    expect(plan.sourceIds).toContain("craigslist");
    expect(plan.sourceIds).not.toContain("copart");
    expect(plan.scope.q).toBeUndefined();
  });

  it("intersects seller type with lane sources instead of widening imports", () => {
    const auctionPlan = planScrapeForBuyerScope({
      vehicleType: "truck",
      lane: "government",
      sellerType: "auction",
    });
    const mismatchedPlan = planScrapeForBuyerScope({
      vehicleType: "truck",
      lane: "government",
      sellerType: "dealer",
    });

    expect(auctionPlan.sourceIds).toEqual([
      "publicsurplus",
      "govdeals",
      "allsurplus",
      "municibid",
      "gsa_auctions",
    ]);
    expect(mismatchedPlan.sourceIds).toEqual([]);
  });
});
