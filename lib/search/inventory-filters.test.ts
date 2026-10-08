import { describe, expect, it, vi } from "vitest";
import {
  applyInventoryLane,
  applyVehicleDetails,
  sellerTypeSourceValues,
  validateInventoryRanges,
} from "./inventory-filters";

function query() {
  const builder = { eq: vi.fn(), in: vi.fn(), or: vi.fn(), ilike: vi.fn() };
  for (const method of Object.values(builder)) method.mockReturnValue(builder);
  return builder;
}

describe("inventory filter contract", () => {
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
    expect(q.eq.mock.calls).toEqual([
      ["options->>fuelType", "Hybrid"],
      ["options->>transmission", "Automatic"],
    ]);
    const unknown = query();
    applyVehicleDetails(
      unknown,
      new URLSearchParams("fuelType=unknown&transmission=all&body=all"),
    );
    expect(unknown.eq).not.toHaveBeenCalled();
    expect(unknown.ilike).not.toHaveBeenCalled();
  });
});
