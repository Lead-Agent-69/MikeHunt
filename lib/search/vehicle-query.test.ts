import { describe, expect, it } from "vitest";
import { matchesVehicleQuery, vehicleQueryTokens } from "./vehicle-query";

describe("vehicle query matching", () => {
  it("matches body-style searches against listing titles", () => {
    expect(
      matchesVehicleQuery(
        { title: "2022 Ford Explorer SUV", make: "Ford", model: "Explorer" },
        "suv",
      ),
    ).toBe(true);
  });

  it("uses buyer-friendly aliases consistently", () => {
    expect(vehicleQueryTokens("truck")).toContain("pickup");
    expect(
      matchesVehicleQuery({ title: "2021 Ram 1500 Pickup" }, "truck"),
    ).toBe(true);
    expect(
      matchesVehicleQuery({ title: "2020 Honda Odyssey Minivan" }, "van"),
    ).toBe(true);
  });

  it("does not match unrelated inventory", () => {
    expect(
      matchesVehicleQuery({ title: "2019 Honda Civic Sedan" }, "truck"),
    ).toBe(false);
  });
});
