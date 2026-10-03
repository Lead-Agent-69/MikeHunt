import { describe, expect, it } from "vitest";
import {
  scanHrefForSavedSearch,
  searchParamsForSavedSearch,
  sourceProofHrefForSavedSearch,
} from "@/hooks/useLocalSavedSearches";

describe("local saved searches", () => {
  it("builds scan and source-proof links from the saved buyer scope", () => {
    const search = {
      q: "police suv",
      make: "Ford",
      makes: ["Ford", "Toyota"],
      model: "Explorer",
      state: "FL",
      lane: "damaged",
      seller_type: "dealer",
      title_type: "salvage",
      dealer_source_ids: ["ae-of-miami"],
      dealer_hosts: ["aeofmiami.com"],
      min_price: 5000,
      max_price: 10000,
      target_profit: 2500,
      require_go: true,
    };

    const params = searchParamsForSavedSearch(search);
    expect(params.get("q")).toBe("police suv");
    expect(params.get("make")).toBe("Ford");
    expect(params.get("makes")).toBe("Ford,Toyota");
    expect(params.get("model")).toBe("Explorer");
    expect(params.get("state")).toBe("FL");
    expect(params.get("lane")).toBe("damaged");
    expect(params.get("sellerType")).toBe("dealer");
    expect(params.get("titleType")).toBe("salvage");
    expect(params.get("dealerSourceIds")).toBe("ae-of-miami");
    expect(params.get("dealers")).toBe("aeofmiami.com");
    expect(params.get("minPrice")).toBe("5000");
    expect(params.get("maxPrice")).toBe("10000");
    expect(params.get("minProfit")).toBe("2500");
    expect(params.get("verdict")).toBe("go");

    expect(scanHrefForSavedSearch(search)).toContain("/scan?");
    expect(scanHrefForSavedSearch(search)).toContain("sort=profit");
    expect(sourceProofHrefForSavedSearch(search)).toContain("/sources?");
    expect(sourceProofHrefForSavedSearch(search)).toContain("lane=damaged");
    expect(sourceProofHrefForSavedSearch(search)).toContain(
      "dealerSourceIds=ae-of-miami",
    );
    expect(sourceProofHrefForSavedSearch(search)).toContain("minPrice=5000");
  });
});
