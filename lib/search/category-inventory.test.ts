import { describe, expect, it } from "vitest";
import { matchingCategoryIds } from "./category-inventory";
import {
  hasVehicleCategoryQuery,
  rowMatchesBuyerQuery,
} from "@/lib/discovery/for-you-rank";

describe("complete scoped category inventory", () => {
  it("recognizes categories without turning every text search into an inventory scan", () => {
    expect(hasVehicleCategoryQuery("Ford trucks")).toBe(true);
    expect(hasVehicleCategoryQuery("F-150")).toBe(false);
  });
  it("finds pickups without a truck word and retains matches after the first 1000 rows", async () => {
    const rows = Array.from({ length: 1102 }, (_, index) => ({
      id: String(index),
      make: index === 1101 ? "Ford" : "Honda",
      model: index === 1101 ? "F-150" : "Civic",
    }));
    const calls: number[] = [];
    const ids = await matchingCategoryIds(async (from, to) => {
      calls.push(from);
      return { data: rows.slice(from, to + 1), error: null };
    }, "truck");
    expect(calls).toEqual([0, 1000]);
    expect(ids).toEqual(["1101"]);
    expect(rowMatchesBuyerQuery(rows[1101], "truck")).toBe(true);
  });
  it("retains additional make terms and excludes SUV/EV truck lookalikes using the shared classifier", async () => {
    const data = [
      { id: "pickup", make: "Ford", model: "F-150" },
      { id: "suv", make: "Ford", model: "Explorer" },
      { id: "other", make: "Toyota", model: "Tacoma" },
    ];
    expect(
      await matchingCategoryIds(
        async () => ({ data, error: null }),
        "Ford trucks",
      ),
    ).toEqual(["pickup"]);
  });
  it("does not publish a partial count after a database error or scope limit", async () => {
    await expect(
      matchingCategoryIds(
        async () => ({ data: null, error: new Error("offline") }),
        "suv",
      ),
    ).rejects.toThrow("offline");
    const data = Array.from({ length: 1000 }, (_, id) => ({
      id: String(id),
      make: "Ford",
      model: "F-150",
    }));
    await expect(
      matchingCategoryIds(async () => ({ data, error: null }), "truck", 1000),
    ).rejects.toThrow("Narrow");
  });
});
