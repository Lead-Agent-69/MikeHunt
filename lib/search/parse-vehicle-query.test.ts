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

describe("parseVehicleQuery — ranges, ZIP, radius, mileage (Kera parity bugs)", () => {
  it("keeps max year and ZIP from Kera's example", () => {
    expect(parseVehicleQuery("2018-2022 honda civic under 25k near 60601")).toEqual({
      make: "Honda",
      model: "Civic",
      minYear: "2018",
      maxYear: "2022",
      maxPrice: "25000",
      zip: "60601",
    });
  });

  it("year phrasing", () => {
    expect(parseVehicleQuery("toyota camry 2015 to 2019")).toMatchObject({ minYear: "2015", maxYear: "2019" });
    expect(parseVehicleQuery("ford f-150 before 2020")).toMatchObject({ maxYear: "2019" });
    expect(parseVehicleQuery("ford f-150 2019 or older")).toMatchObject({ maxYear: "2019" });
    expect(parseVehicleQuery("ford f-150 2019 or older").minYear).toBeUndefined();
    expect(parseVehicleQuery("2016 jeep wrangler")).toMatchObject({ minYear: "2016" });
  });

  it("radius, mileage and price floors without confusing them with price", () => {
    const r = parseVehicleQuery("honda accord under 100k miles under $12,000 within 75 miles of 73301");
    expect(r).toMatchObject({ maxMileage: "100000", maxPrice: "12000", radius: "75", zip: "73301" });
    expect(parseVehicleQuery("silverado $8k-$15k")).toMatchObject({ minPrice: "8000", maxPrice: "15000" });
    expect(parseVehicleQuery("silverado over 5k").minPrice).toBe("5000");
  });
});
