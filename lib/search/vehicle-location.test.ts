import { describe, expect, it } from "vitest";
import { vehicleLocation } from "./vehicle-location";
describe("vehicle location display", () => {
  it.each([
    ["Hollister, MO", "MO", "Hollister, MO"],
    ["Springfield,mo", "MO", "Springfield, MO"],
    ["St. Louis", "MO", "St. Louis, MO"],
    [null, "MO", "MO"],
    [null, null, "Location not reported"],
  ])("normalizes %s / %s", (city, state, expected) =>
    expect(vehicleLocation(city, state)).toBe(expected),
  );
});
