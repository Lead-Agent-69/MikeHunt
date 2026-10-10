import { describe, expect, it } from "vitest";
import { mergePreferencePatch } from "./merge-patch";

describe("shared preference patch semantics", () => {
  it.each(["personal", "diy", "parts", "reseller", "dealer"])(
    "preserves unedited %s parameters and explicit clears",
    (buyerMode) => {
      const existing = {
        buyerScope: {
          buyerMode,
          timeline: "month",
          repairCapability: "basic",
          minPrice: 1000,
          makes: ["Ford"],
        },
        homeLocation: { state: "MO" },
        profileContact: { phone: "555", city: "Ballwin" },
      };
      expect(
        mergePreferencePatch(existing, {
          buyerScope: { maxPrice: 0, makes: [] },
        }),
      ).toEqual({
        ...existing,
        buyerScope: { ...existing.buyerScope, maxPrice: 0, makes: [] },
      });
      expect(
        mergePreferencePatch(existing, { profileContact: { phone: "" } })
          .profileContact,
      ).toEqual({ phone: "", city: "Ballwin" });
    },
  );
  it("does not merge arrays and honors an explicit scope removal", () => {
    expect(
      mergePreferencePatch(
        { searchLocations: [1], buyerScope: { buyerMode: "dealer" } },
        { searchLocations: [], buyerScope: null },
      ),
    ).toEqual({ searchLocations: [], buyerScope: null });
  });
});
