import { describe, expect, it } from "vitest";
import {
  buildScanMatchExplanation,
  buildTrustExplanation,
  damagedLaneFilter,
  dbSourceValues,
  isWatchCandidateVerdict,
  normalizePageSize,
  normalizeScanSort,
  scanSortOrder,
  scanTrustScore,
  sellerTypeSourceValues,
  sortScanRows,
  sourceUrlNeedleFilter,
  sourceUrlNeedles,
  uniqueDbSources,
} from "./route";

describe("scan source filtering helpers", () => {
  it("maps public government sources to the shared DB enum", () => {
    expect(dbSourceValues("govdeals")).toEqual(["gov_auction"]);
    expect(dbSourceValues("publicsurplus")).toEqual(["gov_auction"]);
    expect(dbSourceValues("gsa_auctions")).toEqual(["gov_auction"]);
  });

  it("keeps exact source identity with source URL needles", () => {
    expect(sourceUrlNeedles("govdeals")).toEqual(["govdeals.com"]);
    expect(sourceUrlNeedles("publicsurplus")).toEqual(["publicsurplus.com"]);
    expect(sourceUrlNeedles("gsa_auctions")).toEqual([
      "gsaauctions.gov",
      "gsa.gov",
    ]);
  });

  it("knows named small dealer hostnames", () => {
    expect(sourceUrlNeedles("ae-of-miami")).toEqual(["aeofmiami.com"]);
    expect(sourceUrlNeedles("stjames-auto")).toEqual([
      "stjamesauto.com",
      "stjamesautoparts.com",
    ]);
    expect(uniqueDbSources(["ae-of-miami"])).toEqual(["independent_dealer"]);
  });

  it("builds exact URL filters for watched dealer source ids", () => {
    const filter = sourceUrlNeedleFilter(["ae-of-miami", "stjames-auto"]);

    expect(sourceUrlNeedleFilter(["ae-of-miami"])).toBe(
      "source_url.ilike.%aeofmiami.com%",
    );
    expect(filter).toContain("source_url.ilike.%aeofmiami.com%");
    expect(filter).toContain("source_url.ilike.%stjamesauto.com%");
    expect(filter).toContain("source_url.ilike.%stjamesautoparts.com%");
  });

  it("treats repairable damage history as damaged-lane inventory", () => {
    const filter = damagedLaneFilter();
    expect(filter).toContain("condition.in.");
    expect(filter).toContain("salvage_title");
    expect(filter).toContain("damage_type.ilike.%repairable%");
  });

  it("honors explicit small page sizes while capping large payloads", () => {
    expect(normalizePageSize("2")).toBe(2);
    expect(normalizePageSize("0")).toBe(1);
    expect(normalizePageSize("250")).toBe(100);
    expect(normalizePageSize(null)).toBe(48);
  });

  it("maps scan sort options to database order columns", () => {
    expect(normalizeScanSort("price")).toBe("price");
    expect(normalizeScanSort("score")).toBe("score");
    expect(normalizeScanSort("profit")).toBe("profit");
    expect(normalizeScanSort("unknown")).toBe("profit");
    expect(scanSortOrder("price")).toMatchObject({
      column: "ask_price",
      ascending: true,
    });
    expect(scanSortOrder("score")).toMatchObject({
      column: "last_seen_at",
      ascending: false,
    });
    expect(scanSortOrder("profit")).toMatchObject({
      column: "true_net_profit",
      ascending: false,
    });
  });

  it("recognizes watch as a product-level scan verdict", () => {
    expect(isWatchCandidateVerdict("watch")).toBe(true);
    expect(isWatchCandidateVerdict("WATCH")).toBe(true);
    expect(isWatchCandidateVerdict("go")).toBe(false);
    expect(isWatchCandidateVerdict(null)).toBe(false);
  });

  it("ranks proven listings above thin cards when sorting by score", () => {
    const thin = {
      title: "Thin high score",
      profitScore: 90,
      dataQuality: { score: 42 },
      images: [],
    };
    const proven = {
      title: "Proven buyer-ready listing",
      profitScore: 76,
      dataQuality: { score: 88 },
      vin: "JN1AR5EF5EM270025",
      mileage: 65000,
      images: ["photo.jpg"],
      sourceUrl: "https://www.govdeals.com/asset/2525/26960",
      auctionEndAt: "2026-10-04T12:46:00Z",
      seller: "Seller 26960",
    };

    expect(scanTrustScore(proven)).toBeGreaterThan(scanTrustScore(thin));
    expect(sortScanRows([thin, proven], "score")[0]).toBe(proven);
  });

  it("explains why a listing is shown and what still needs verification", () => {
    const rich = buildTrustExplanation({
      profitEstimate: 2400,
      profitScore: 78,
      vin: "JN1AR5EF5EM270025",
      mileage: 65000,
      titleType: "clean",
      auctionEndAt: "2026-10-04T12:46:00Z",
      seller: "Seller 26960",
      sourceUrl: "https://www.govdeals.com/asset/2525/26960",
      lastSeenAt: new Date().toISOString(),
      images: ["photo.jpg"],
      repair_estimate: 1500,
      transport_cost: 650,
      dealVerdict: "go",
      recommendedMaxBid: 7200,
      valuation: { basis: "comps", compCount: 4, soldCount: 2 },
      dataQuality: { score: 88, missing: ["sellerContact"] },
    });
    const thin = buildTrustExplanation({
      images: [],
      dataQuality: { score: 35, missing: ["vin", "mileage", "auction"] },
    });

    expect(rich.confidence).toBe("high");
    expect(rich.reasons).toContain("VIN captured");
    expect(rich.reasons).toContain("Mileage captured");
    expect(rich.reasons).toContain("seen this hour");
    expect(rich.reasons).toContain("$1,500 repair estimate");
    expect(rich.reasons).toContain("$650 transport estimate");
    expect(rich.reasons).toContain("BUY verdict from profit and proof scoring");
    expect(rich.reasons).toContain("$7,200 recommended max buy");
    expect(rich.reasons).toContain("6 valuation comps");
    expect(rich.reasons).toContain("Resale estimate is comp-backed");
    expect(rich.nextChecks).toContain("find seller contact path");
    expect(thin.confidence).toBe("low");
    expect(thin.nextChecks).toContain("verify VIN");
    expect(thin.nextChecks).toContain("verify mileage");
    expect(thin.nextChecks).toContain("verify repair estimate");
    expect(thin.nextChecks).toContain("confirm transport quote");
    expect(thin.nextChecks).toContain("verify comparable resale comps");
  });

  it("caps confidence when resale evidence is only the seller asking price", () => {
    const explanation = buildTrustExplanation({
      profitEstimate: 2400,
      profitScore: 78,
      vin: "JN1AR5EF5EM270025",
      mileage: 65000,
      titleType: "clean",
      auctionEndAt: "2026-10-04T12:46:00Z",
      seller: "Seller 26960",
      sourceUrl: "https://www.govdeals.com/asset/2525/26960",
      lastSeenAt: new Date().toISOString(),
      images: ["photo.jpg"],
      repair_estimate: 1500,
      transport_cost: 650,
      dealVerdict: "go",
      recommendedMaxBid: 7200,
      valuation: { source: "asking_price", compCount: 0, soldCount: 0 },
      dataQuality: { score: 88, missing: [] },
    });

    expect(explanation.confidence).toBe("medium");
    expect(explanation.nextChecks).toContain("verify comparable resale comps");
  });

  it("adds buyer-scope reasons to scan trust explanations", () => {
    const row = {
      make: "Ford",
      model: "Explorer",
      locationState: "FL",
      titleType: "salvage",
      sellerType: "dealer",
      askPrice: 6980,
      sourceUrl: "https://aeofmiami.com/product/2022-ford-explorer",
      images: ["photo.jpg"],
      dataQuality: { score: 73, missing: ["vin", "mileage"] },
    };
    const filters = {
      lane: "damaged",
      state: "FL",
      sellerType: "dealer",
      makes: ["Ford", "Toyota"],
      minPrice: 5000,
      maxPrice: 10000,
      dealerSourceIds: ["ae-of-miami"],
    };

    expect(buildScanMatchExplanation(row, filters)).toEqual(
      expect.arrayContaining([
        "FL matches selected market",
        "damaged lane",
        "Ford matches make focus",
        "dealer seller scope",
        "over $5,000 budget",
        "under $10,000 budget",
      ]),
    );

    const explanation = buildTrustExplanation(row, filters);
    expect(explanation.reasons).toEqual(
      expect.arrayContaining([
        "FL matches selected market",
        "damaged lane",
        "Ford matches make focus",
        "over $5,000 budget",
        "under $10,000 budget",
        "AE of Miami dealer target",
        "Original source link is present",
      ]),
    );
  });

  it("uses buyer-facing source names and honest historical valuation language", () => {
    const explanation = buildTrustExplanation(
      {
        source: "govdeals",
        sourceUrl: "https://govdeals.com/asset/1",
        valuation: {
          basis: "market",
          source: "historical_estimate",
          sampleCount: 24,
          compCount: 0,
          soldCount: 0,
        },
        dataQuality: { score: 64, missing: ["vin"] },
      },
      { lane: "government", source: "govdeals" },
    );

    expect(explanation.reasons).toContain("GovDeals source");
    expect(explanation.reasons).toContain(
      "Resale estimate uses active-listing history, not sold comps",
    );
    expect(explanation.reasons).not.toContain(
      "Resale estimate uses market value signals",
    );
  });

  it("maps seller type filters to source families", () => {
    expect(sellerTypeSourceValues("dealer")).toContain("independent_dealer");
    expect(sellerTypeSourceValues("auction")).toContain("gov_auction");
    expect(sellerTypeSourceValues("private")).toContain("facebook_marketplace");
    expect(sellerTypeSourceValues("all")).toEqual([]);
  });
});
