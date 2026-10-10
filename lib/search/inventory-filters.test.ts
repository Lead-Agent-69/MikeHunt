import { describe, expect, it, vi } from "vitest";
import {
  applyInventoryViewScope,
  inventoryViewParams,
} from "./inventory-view-scope";
import {
  applyInventoryLane,
  applyRepairEligibility,
  applyVehicleDetails,
  applyInventoryNumericFilters,
  sellerTypeSourceValues,
  validateInventoryRanges,
} from "./inventory-filters";

function query() {
  const builder = {
    eq: vi.fn(),
    in: vi.fn(),
    or: vi.fn(),
    ilike: vi.fn(),
    is: vi.fn(),
    gt: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    not: vi.fn(),
  };
  for (const method of Object.values(builder)) method.mockReturnValue(builder);
  return builder;
}

describe("inventory filter contract", () => {
  it("keeps Scan policies when switching to Feed or Map without adding strict duplicate bounds", () => {
    const params = inventoryViewParams(
      new URLSearchParams(
        "maxPrice=10000&pricePolicy=include&maxMileage=0&mileagePolicy=include",
      ),
    );
    const q = query();
    applyInventoryViewScope(q, params);
    expect(params.get("pricePolicy")).toBe("include");
    expect(params.get("mileagePolicy")).toBe("include");
    expect(q.or).toHaveBeenCalledWith(
      "ask_price.is.null,ask_price.lte.0,and(ask_price.gt.0,ask_price.lte.10000)",
    );
    expect(q.lte).not.toHaveBeenCalled();
    expect(q.gt).not.toHaveBeenCalled();
  });
  it("treats empty range values in navigation links as unset, not invalid or zero", () => {
    const params = new URLSearchParams(
      "minPrice=&maxPrice=&minMileage=&maxMileage=&minYear=&maxYear=",
    );
    expect(validateInventoryRanges(params)).toBeNull();
    const q = query();
    applyInventoryNumericFilters(q, params);
    expect(q.gte).not.toHaveBeenCalled();
    expect(q.lte).not.toHaveBeenCalled();
  });
  it("keeps default range behavior and treats zero-mile odometers as reported", () => {
    const q = query();
    applyInventoryNumericFilters(
      q,
      new URLSearchParams("maxPrice=10000&maxMileage=0"),
    );
    expect(q.gt).toHaveBeenCalledWith("ask_price", 0);
    expect(q.lte.mock.calls).toEqual([
      ["ask_price", 10000],
      ["mileage", 0],
    ]);
    expect(q.or).not.toHaveBeenCalled();
    const reported = query();
    applyInventoryNumericFilters(
      reported,
      new URLSearchParams("mileagePolicy=reported"),
    );
    expect(reported.gte).toHaveBeenCalledWith("mileage", 0);
  });
  it("does not impose a range or invent a value when none was requested", () => {
    const q = query();
    applyInventoryNumericFilters(q, new URLSearchParams());
    expect(q.gt).not.toHaveBeenCalled();
    expect(q.gte).not.toHaveBeenCalled();
    expect(q.lte).not.toHaveBeenCalled();
  });
  it("includes unreported values without broadening the reported-value ranges", () => {
    const q = query();
    applyInventoryNumericFilters(
      q,
      new URLSearchParams(
        "pricePolicy=include&minPrice=5000&maxPrice=10000&mileagePolicy=include&minMileage=0&maxMileage=80000",
      ),
    );
    expect(q.or.mock.calls).toEqual([
      [
        "ask_price.is.null,ask_price.lte.0,and(ask_price.gt.0,ask_price.gte.5000,ask_price.lte.10000)",
      ],
      [
        "mileage.is.null,mileage.lt.0,and(mileage.gte.0,mileage.gte.0,mileage.lte.80000)",
      ],
    ]);
    expect(q.gt).not.toHaveBeenCalled();
    expect(q.gte).not.toHaveBeenCalled();
    expect(q.lte).not.toHaveBeenCalled();
  });
  it("unreported-only values do not pretend to have a known budget or odometer", () => {
    const q = query();
    applyInventoryNumericFilters(
      q,
      new URLSearchParams(
        "pricePolicy=unknown&maxPrice=10000&mileagePolicy=unknown&maxMileage=0",
      ),
    );
    expect(q.or.mock.calls).toEqual([
      ["ask_price.is.null,ask_price.lte.0"],
      ["mileage.is.null,mileage.lt.0"],
    ]);
    expect(q.lte).not.toHaveBeenCalled();
  });
  it.each([
    "pricePolicy=invalid",
    "mileagePolicy=include,ask_price.gt.0",
    "minPrice=1.5",
    "maxMileage=-1",
  ])("rejects invalid policy or range %s", (params) => {
    expect(validateInventoryRanges(new URLSearchParams(params))).toBeTruthy();
  });
  it("applies repair exclusions before pagination without conflating clean title with no damage", () => {
    const q = query();
    expect(applyRepairEligibility(q, "0")).toBe(q);
    expect(q.or.mock.calls[0][0]).toBe(
      "condition.is.null,condition.in.(clean_title,run_drive)",
    );
    expect(q.or.mock.calls[1][0]).toContain("damage_type.is.null");
    expect(q.or.mock.calls[1][0]).toContain("damage_type.ilike.unknown");
    const enabled = query();
    applyRepairEligibility(enabled, "1");
    expect(enabled.or).not.toHaveBeenCalled();
  });
  it("accepts custom ranges and rejects inverted, negative or malformed ranges", () => {
    expect(
      validateInventoryRanges(
        new URLSearchParams(
          "minPrice=1750&maxPrice=13425&minYear=2014&maxYear=2026&maxMileage=85400",
        ),
      ),
    ).toBeNull();
    for (const value of [
      "minPrice=20000&maxPrice=10000",
      "minYear=-1",
      "maxMileage=50k",
      "minMileage=100&maxMileage=50",
      "maxPrice=Infinity",
    ])
      expect(validateInventoryRanges(new URLSearchParams(value))).toBeTruthy();
  });

  it("parts are a reported condition, not every independent dealer listing", () => {
    const q = query();
    expect(applyInventoryLane(q, "parts")).toBe(q);
    expect(q.eq).toHaveBeenCalledWith("condition", "parts_only");
    expect(q.in).not.toHaveBeenCalled();
  });

  it("private sellers exclude independent and Craigslist dealers", () => {
    const privateSources = sellerTypeSourceValues("private");
    expect(privateSources).not.toContain("independent_dealer");
    expect(privateSources).not.toContain("craigslist_dealer");
    expect(sellerTypeSourceValues("dealer")).toContain("craigslist_dealer");
    const q = query();
    applyInventoryLane(q, "private");
    expect(q.in).toHaveBeenCalledWith("source", privateSources);
  });

  it("details filter stored fields and only known parsed spec enums", () => {
    const q = query();
    applyVehicleDetails(
      q,
      new URLSearchParams(
        "damage=front&body=SUV&trim=Limited&fuelType=Hybrid&transmission=Automatic",
      ),
    );
    expect(q.ilike.mock.calls).toEqual([
      ["damage_type", "%front%"],
      ["body_class", "%SUV%"],
      ["trim", "%Limited%"],
    ]);
    expect(q.or.mock.calls).toEqual([
      ["fuel_type.ilike.%Hybrid%,options->>fuelType.eq.Hybrid"],
      ["transmission.ilike.%Automatic%,options->>transmission.eq.Automatic"],
    ]);
    const unknown = query();
    applyVehicleDetails(
      unknown,
      new URLSearchParams("fuelType=unknown&transmission=all&body=all"),
    );
    expect(unknown.eq).not.toHaveBeenCalled();
    expect(unknown.ilike).not.toHaveBeenCalled();
  });
  it("keeps missing keys distinct from reported absent keys and filters actual buy-now prices", () => {
    const unknown = query();
    applyVehicleDetails(unknown, new URLSearchParams("keys=unknown&buyNow=1"));
    expect(unknown.is).toHaveBeenCalledWith("keys_present", null);
    expect(unknown.eq).not.toHaveBeenCalled();
    expect(unknown.gt).toHaveBeenCalledWith("buy_now_price", 0);
    const absent = query();
    applyVehicleDetails(absent, new URLSearchParams("keys=no"));
    expect(absent.eq).toHaveBeenCalledWith("keys_present", false);
  });
});
