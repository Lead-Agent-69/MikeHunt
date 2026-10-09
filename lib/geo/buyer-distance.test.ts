import { describe, expect, it } from "vitest";
import {
  buyerDistance,
  resolvePointState,
  ROAD_FACTOR,
  transportCostForDistance,
} from "./buyer-distance";
import { haversineMiles } from "./distance";
import { milesBetweenStates, transportCostForMiles } from "@/lib/geo";

describe("buyerDistance", () => {
  it("uses real coordinates when both sides have them", () => {
    // St. Louis → Kansas City
    const d = buyerDistance(
      { lat: 38.627, lng: -90.1994, state: "MO" },
      { lat: 39.0997, lng: -94.5786, state: "MO" },
    );
    expect(d.basis).toBe("coords");
    const straight = haversineMiles(38.627, -90.1994, 39.0997, -94.5786)!;
    expect(d.miles).toBe(Math.round(straight * ROAD_FACTOR));
    expect(d.miles!).toBeGreaterThan(300);
    expect(d.miles!).toBeLessThan(330);
  });

  it("falls back to state centroids across states (same math as milesBetweenStates)", () => {
    const d = buyerDistance({ state: "MO" }, { state: "TX" });
    expect(d.basis).toBe("state_centroid");
    expect(d.miles).toBe(milesBetweenStates("MO", "TX"));
  });

  it("resolves a home ZIP to its state", () => {
    expect(resolvePointState({ zip: "63101" })).toBe("MO");
    const d = buyerDistance({ zip: "63101" }, { state: "IL" });
    expect(d.homeState).toBe("MO");
    expect(d.basis).toBe("state_centroid");
  });

  it("does not invent miles inside one state without coordinates", () => {
    const d = buyerDistance({ state: "CA" }, { state: "ca" });
    expect(d).toMatchObject({ miles: null, basis: "same_state" });
    expect(transportCostForDistance(d, 600)).toBe(transportCostForMiles(0));
  });

  it("treats null-island / garbage coords as missing", () => {
    const d = buyerDistance(
      { lat: 0, lng: 0, state: "MO" },
      { lat: "x", lng: 1, state: "KS" },
    );
    expect(d.basis).toBe("state_centroid");
  });

  it("is unknown without a usable home or listing location", () => {
    expect(buyerDistance(null, { state: "TX" }).basis).toBe("unknown");
    expect(buyerDistance({ state: "NATIONWIDE" }, { state: "TX" }).basis).toBe(
      "unknown",
    );
    expect(buyerDistance({ state: "TX" }, {}).basis).toBe("unknown");
    expect(transportCostForDistance(buyerDistance(null, null), 600)).toBe(600);
    expect(
      transportCostForDistance(buyerDistance(null, null), null),
    ).toBeNull();
  });
});
