import { describe, expect, it } from "vitest";
import {
  isLocationDemandWarming,
  LOCATION_DEMAND_WARMING_MS,
} from "./location-demand-warming";

describe("isLocationDemandWarming", () => {
  const now = Date.parse("2026-10-07T14:00:00Z");
  it("scans within the window", () => {
    expect(
      isLocationDemandWarming(
        {
          locationDemandAt: "2026-10-07T13:00:00Z",
          locationDemandStates: ["MO"],
        },
        now,
      ).scanning,
    ).toBe(true);
  });
  it("stops after the window", () => {
    expect(
      isLocationDemandWarming(
        {
          locationDemandAt: new Date(
            now - LOCATION_DEMAND_WARMING_MS - 1,
          ).toISOString(),
          locationDemandStates: ["MO"],
        },
        now,
      ).scanning,
    ).toBe(false);
  });
});
