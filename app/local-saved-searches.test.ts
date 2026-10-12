import { afterEach, describe, expect, it, vi } from "vitest";
import {
  scanHrefForSavedSearch,
  searchParamsForSavedSearch,
  sourceProofHrefForSavedSearch,
  saveLocalSavedSearch,
  readLocalSavedSearches,
  writeLocalSavedSearches,
  LOCAL_SAVED_SEARCH_KEY,
} from "@/hooks/useLocalSavedSearches";

describe("local saved searches", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });
  it("does not report successful saves when device storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveLocalSavedSearch({ name: "Honda" })).toThrow(
      "Device storage is unavailable",
    );
    expect(readLocalSavedSearches()).toEqual([]);
  });
  it("keeps existing searches instead of silently evicting them at the device limit", () => {
    const existing = Array.from({ length: 40 }, (_, index) => ({
      id: `local-${index}`,
      name: `Search ${index}`,
    }));
    writeLocalSavedSearches(existing);
    expect(() => saveLocalSavedSearch({ name: "New search" })).toThrow(
      "storage is full",
    );
    expect(readLocalSavedSearches()).toEqual(existing);
  });
  it("uses unique identities for searches saved in the same millisecond", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000);
    saveLocalSavedSearch({ name: "First" });
    saveLocalSavedSearch({ name: "Second" });
    expect(readLocalSavedSearches()).toHaveLength(2);
    expect(localStorage.getItem(LOCAL_SAVED_SEARCH_KEY)).toContain("First");
  });
  it("preserves the exact specification, mileage and sort scope", () => {
    const saved = {
      scan_params:
        "sort=price-desc&minMileage=30000&maxMileage=85000&fuelType=Hybrid&damage=front&trim=Limited&transmission=Automatic&availability=on_lot&drivetrain=AWD",
    };
    const params = new URL(
      scanHrefForSavedSearch(saved),
      "https://example.test",
    ).searchParams;
    new URLSearchParams(saved.scan_params).forEach((value, key) =>
      expect(params.get(key)).toBe(value),
    );
    expect(params.get("reset")).toBe("1");
  });
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
