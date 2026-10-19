import { describe, expect, it } from "vitest";
import { parseMarketSearch } from "./parse-search";

describe("Market search preview", () => {
  it("previews explicit filters and keeps near me dependent on a chosen location", () => {
    const result = parseMarketSearch(
      "Black Audi wagon, AWD, under $30k near me",
    );
    expect(result.blocked).toBe(false);
    expect(result.needsNearby).toBe(true);
    expect(result.filters).toMatchObject({
      makes: ["Audi"],
      model: "",
      priceMax: "30000",
      priceBasis: "cash",
      q: "",
    });
    expect(result.filters.states).toBeUndefined();
    expect(result.details).toMatchObject({
      color: "black",
      body: "Wagon",
      drivetrain: "AWD",
      pricePolicy: "reported",
    });
  });
  it.each([
    [
      "Ford F150 2018-2022 under 100k miles under $25k near 63304 within 75 miles",
      {
        makes: ["Ford"],
        model: "F-150",
        yearMin: "2018",
        yearMax: "2022",
        mileageMax: "100000",
        priceMax: "25000",
        near: "63304",
        radius: "75",
      },
    ],
    [
      "Toyota Camry 2020 in TX from $5000",
      {
        makes: ["Toyota"],
        model: "Camry",
        yearMin: "2020",
        yearMax: "2020",
        priceMin: "5000",
        states: ["TX"],
      },
    ],
    [
      "Honda Civic under $2020",
      { makes: ["Honda"], model: "Civic", priceMax: "2020" },
    ],
    ["Ford under 2020", { makes: ["Ford"], model: "", priceMax: "2020" }],
    [
      "Audi between 2018 and 2022 between 10k and 20k",
      {
        yearMin: "2018",
        yearMax: "2022",
        priceMin: "10000",
        priceMax: "20000",
      },
    ],
    [
      "Chevy Silverado $8k-$15k",
      {
        makes: ["Chevrolet"],
        model: "Silverado",
        priceMin: "8000",
        priceMax: "15000",
      },
    ],
    ["Ford 30k", { priceMax: "30000" }],
    ["Ford under 0 miles", { mileageMax: "0" }],
    ["Audi after 2018", { yearMin: "2019" }],
    ["Audi before 2020", { yearMax: "2019" }],
  ] as const)("parses %s", (query, expected) => {
    const result = parseMarketSearch(query);
    expect(result.blocked, JSON.stringify(result)).toBe(false);
    expect(result.filters).toMatchObject(expected);
    if (query.includes("$2020") || query === "Ford under 2020")
      expect(result.filters.yearMin).toBeUndefined();
    if (query.includes("from $5000"))
      expect(result.filters.priceMax).toBeUndefined();
  });
  it.each([
    "Ford no accidents",
    "Ford without salvage",
    "Ford $299 per month",
    "Ford $500 down payment",
    "Ford and Acura",
    "Ford gas or electric",
    "SUV or truck",
    "red or blue Ford",
    "Ford within 1001 miles",
    "Ford within 0 miles",
    "Ford under $0",
    "Ford $20k-$10k",
    "Ford under $30.50",
    "Ford under 1000k miles",
    "Ford 2018 or 2022",
    "Ford from 2018",
    "Ford 30000",
    "Ford near me in TX",
  ])("blocks ambiguous or unsupported constraints: %s", (query) => {
    expect(parseMarketSearch(query).blocked, query).toBe(true);
  });
  it("does not infer history, ownership, equipment or lifestyle suitability", () => {
    const result = parseMarketSearch(
      "Ford good for dogs and camping heated seats",
    );
    expect(result.filters.makes).toEqual(["Ford"]);
    expect(result.filters.model).toBe("");
    expect(result.filters.q).toContain("dogs");
    expect(result.details).toEqual({});
    expect(result.warnings.join(" ")).toContain("not inferred");
    expect(parseMarketSearch("Ford clean title").warnings.join(" ")).toContain(
      "does not establish accident-free",
    );
  });
  it("retains distinct PHEV, CVT and DCT categories", () => {
    expect(parseMarketSearch("Toyota PHEV e-CVT").details).toMatchObject({
      fuelType: "PHEV",
      transmission: "CVT",
    });
    expect(parseMarketSearch("VW Golf DCT").details.transmission).toBe("DCT");
  });
  it("does not mistake words containing brand names for brands", () => {
    expect(parseMarketSearch("camping program").filters.makes).toBeUndefined();
  });
  it.each([
    ["Ford state: TX", "TX"],
    ["Ford near Missouri", "MO"],
    ["FORD IN TX", "TX"],
    ["FORD IN MISSOURI", "MO"],
    ["Ford in IN", "IN"],
    ["Ford in OR", "OR"],
  ])("treats location prepositions correctly: %s", (query, state) => {
    const result = parseMarketSearch(query);
    expect(result.blocked).toBe(false);
    expect(result.filters.states).toEqual([state]);
    expect(result.filters.q).toBe("");
  });
  it("does not turn a model name into a state or discard conflicting locations", () => {
    expect(parseMarketSearch("Pontiac Montana").filters).toMatchObject({
      makes: ["Pontiac"],
      model: "Montana",
    });
    expect(parseMarketSearch("Pontiac Montana").filters.states).toBeUndefined();
    expect(parseMarketSearch("Ford in TX or CA").blocked).toBe(true);
    expect(parseMarketSearch("Ford near 63304 in TX").blocked).toBe(true);
  });
});
