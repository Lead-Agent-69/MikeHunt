import { describe, expect, it } from "vitest";
import { parseVehicleQuery } from "./parse-vehicle-query";

describe("parseVehicleQuery", () => {
  it("reads make, model, budget, year and state literally", () => {
    expect(parseVehicleQuery("chevy silverado $12,500 texas 2012")).toEqual({
      make: "Chevrolet",
      model: "Silverado",
      minYear: "2012",
      maxPrice: "12500",
      state: "TX",
    });
  });

  it("does not treat words as states or stopwords as models", () => {
    expect(parseVehicleQuery("honda under 8000 or best offer")).toEqual({
      make: "Honda",
      maxPrice: "8000",
    });
  });

  it("does not read mileage as a price", () => {
    expect(parseVehicleQuery("toyota tacoma 90k miles")).toEqual({
      make: "Toyota",
      model: "Tacoma",
    });
  });

  it("returns nothing it cannot find", () => {
    expect(parseVehicleQuery("sienna")).toEqual({});
    expect(parseVehicleQuery("")).toEqual({});
  });
});
