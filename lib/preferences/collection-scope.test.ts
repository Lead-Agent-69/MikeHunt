import { describe, expect, it } from "vitest";
import { preferenceCollectionScope } from "./collection-scope";

describe("preference collection scope", () => {
  it("preserves multiple categories, budget, makes, title and selected states", () => {
    expect(
      preferenceCollectionScope(
        {
          buyerScope: {
            buyerMode: "personal",
            vehicles: ["SUVs", "Sedans"],
            maxPrice: 20000,
            titleType: "clean",
            preferredMakes: ["Ford", "Toyota"],
          },
        },
        ["MO", "IL"],
      ),
    ).toMatchObject({
      vehicleType: "suv sedan",
      maxPrice: 20000,
      titleType: "clean",
      makes: ["Ford", "Toyota"],
      state: "MO",
      states: ["MO", "IL"],
      lane: "clean-retail",
      includeRepairable: false,
    });
  });

  it("preserves explicit lane and repair preference across buyer modes", () => {
    for (const buyerMode of [
      "personal",
      "diy",
      "parts",
      "reseller",
      "dealer",
    ]) {
      expect(
        preferenceCollectionScope(
          {
            buyerScope: {
              buyerMode,
              laneValue: "government",
              includeRepairable: true,
            },
          },
          ["TX"],
        ),
      ).toMatchObject({ lane: "government", includeRepairable: true });
    }
  });

  it("does not turn all vehicle types into a literal keyword or override saved scope state", () => {
    expect(
      preferenceCollectionScope(
        {
          buyerScope: {
            vehicle: "All vehicle types",
            state: "TX",
          },
        },
        ["MO"],
      ),
    ).toMatchObject({ state: "MO", vehicleType: undefined });
  });

  it("retains watched dealer restrictions", () => {
    expect(
      preferenceCollectionScope(
        {
          buyerScope: {
            watchedDealers: ["aeofmiami.com"],
            watchedDealerSourceIds: ["ae-of-miami"],
          },
        },
        ["FL"],
      ),
    ).toMatchObject({
      dealerHosts: ["aeofmiami.com"],
      dealerSourceIds: ["ae-of-miami"],
    });
  });
});
