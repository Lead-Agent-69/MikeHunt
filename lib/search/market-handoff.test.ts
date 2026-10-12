import { describe, expect, it } from "vitest";
import { marketHandoff, marketHandoffs } from "./market-handoff";

describe("wider market handoff", () => {
  it("preserves exact model words instead of guessing a slug or merging distinct models", () => {
    const result = marketHandoff(
      new URLSearchParams({
        make: "Ford",
        model: "Bronco Sport",
        q: '"heated seats"',
        minPrice: "0",
        maxPrice: "25000",
        minYear: "2020",
        maxMileage: "60000",
        state: "TX",
      }),
    );
    const url = new URL(result.href);
    expect(url.origin).toBe("https://www.autotempest.com");
    expect(url.searchParams.has("make")).toBe(false);
    expect(url.searchParams.get("make_kw")).toBe("Ford");
    expect(url.searchParams.get("model_kw")).toBe("Bronco Sport");
    expect(url.searchParams.get("keywords")).toBe('"heated seats"');
    expect(url.searchParams.get("minprice")).toBe("0");
    expect(url.searchParams.get("maxprice")).toBe("25000");
    expect(url.searchParams.get("minyear")).toBe("2020");
    expect(url.searchParams.get("maxmiles")).toBe("60000");
    expect(url.searchParams.get("localization")).toBe("state");
    expect(result.location).toBe("Statewide: TX");
    expect(result.reapply).toEqual([]);
  });

  it("never claims unsupported filters or internal intelligence carried across", () => {
    const result = marketHandoff(
      new URLSearchParams({
        damage: "flood",
        titleType: "clean",
        minProfit: "5000",
        runDrive: "yes",
        makes: "Ford,Toyota",
        source: "copart",
        sort: "profit",
        offset: "50",
      }),
    );
    expect(result.reapply).toEqual([
      "Damage: flood",
      "Title: clean",
      "Minimum profit: 5000",
      "Run & drive: yes",
      "Multiple makes: Ford,Toyota",
      "Sources: copart",
    ]);
    expect(result.href).not.toContain("profit");
    expect(result.href).not.toContain("copart");
    expect(result.location).toBe("Nationwide: US");
    expect(new URL(result.href).searchParams.get("localization")).toBe(
      "country",
    );
  });

  it("maps only verified vehicle enums and safely encodes text", () => {
    const result = marketHandoff(
      new URLSearchParams({
        body: "Pickup",
        transmission: "Manual",
        trim: "A&B",
        maxPrice: "NaN",
        state: "XX",
        fuelType: "Electric",
      }),
    );
    const url = new URL(result.href);
    expect(url.searchParams.get("bodystyle")).toBe("truck");
    expect(url.searchParams.get("transmission")).toBe("man");
    expect(url.searchParams.get("trim_kw")).toBe("A&B");
    expect(url.searchParams.has("maxprice")).toBe(false);
    expect(result.reapply).toContain("Maximum price: NaN");
    expect(result.reapply).toContain("State: XX");
    expect(result.reapply).toContain("Fuel: Electric");
  });

  it("does not mutate the active search or send arbitrary query keys", () => {
    const params = new URLSearchParams(
      "q=Camry&token=private&lane=all&maxPrice=any",
    );
    const before = params.toString();
    const result = marketHandoff(params);
    expect(params.toString()).toBe(before);
    expect(new URL(result.href).searchParams.has("token")).toBe(false);
    expect(result.reapply).toEqual([]);
  });

  it("preserves ZIP/radius without claiming the state filter also transferred", () => {
    const result = marketHandoff(
      new URLSearchParams("make=Honda&zip=63021&radius=50&state=MO"),
    );
    const url = new URL(result.href);
    expect(url.searchParams.get("zip")).toBe("63021");
    expect(url.searchParams.get("radius")).toBe("50");
    expect(url.searchParams.has("localization")).toBe(false);
    expect(result.location).toBe("Within 50 mi of ZIP 63021");
    expect(result.reapply).toEqual(["State: MO"]);
  });
  it("uses the indexed search's default and maximum radius", () => {
    expect(
      new URL(
        marketHandoff(new URLSearchParams("zip=60601")).href,
      ).searchParams.get("radius"),
    ).toBe("100");
    expect(
      new URL(
        marketHandoff(new URLSearchParams("zip=60601&radius=999999")).href,
      ).searchParams.get("radius"),
    ).toBe("500");
  });
  it("does not show unknown or prototype query values", () => {
    const result = marketHandoff(
      new URLSearchParams(
        "constructor=secret&user_id=private&token=secret&states=MO,IL",
      ),
    );
    expect(result.reapply).toEqual(["States: MO,IL"]);
    expect(result.href).not.toMatch(/secret|private|user_id/);
  });
  it("expands supported car searches and reports omitted filters per site", () => {
    const results = marketHandoffs(
      new URLSearchParams(
        "make=Honda&model=Civic&zip=60601&radius=50&maxYear=2022&maxPrice=25000&damage=flood&includeRepairable=0",
      ),
    );
    expect(results.length).toBeGreaterThan(4);
    expect(results.map((r) => r.id)).toContain("craigslist");
    expect(results.map((r) => r.id)).not.toContain("copart");
    expect(results.map((r) => r.id)).not.toContain("visor");
    const local = results.find((r) => r.id === "craigslist")!;
    expect(new URL(local.href).searchParams.get("postal")).toBe("60601");
    expect(local.reapply).toContain("Damage: flood");
    expect(local.reapply).toContain("Repairable vehicles: excluded");
    const auction = results.find((r) => r.id === "ebay_motors")!;
    expect(auction.reapply).toContain("Maximum year: 2022");
    expect(auction.carried).not.toContain("Maximum year: 2022");
  });
  it("does not call invalid or unconfirmed enum parameters transferred", () => {
    const results = marketHandoffs(
      new URLSearchParams(
        "make=Honda&model=Civic&body=Spaceship&fuelType=Electric",
      ),
    );
    const cars = results.find((r) => r.id === "cars_com")!;
    expect(cars.reapply).toContain("Body style: Spaceship");
    expect(cars.carried).not.toContain("Body style: Spaceship");
    expect(cars.unconfirmed).toContain("Fuel: Electric");
    expect(cars.carried).not.toContain("Fuel: Electric");
  });
  it("does not silently broaden private-seller, multi-make or non-car searches", () => {
    expect(
      marketHandoffs(
        new URLSearchParams("make=Honda&zip=60601&sellerType=private"),
      ).map((r) => r.id),
    ).toEqual(["autotempest", "craigslist"]);
    expect(
      marketHandoffs(new URLSearchParams("make=Honda&makes=Honda,Toyota")),
    ).toHaveLength(1);
    expect(
      marketHandoffs(new URLSearchParams("make=Honda&category=motorcycle")),
    ).toHaveLength(0);
    expect(marketHandoffs(new URLSearchParams("q=Camry"))).toHaveLength(1);
  });
  it("keeps deal-category chips distinct from vehicle-type scope", () => {
    const results = marketHandoffs(
      new URLSearchParams("make=Honda&category=high_margin"),
    );
    expect(results.length).toBeGreaterThan(3);
    expect(results[1].reapply).toContain("Category: high_margin");
    expect(
      marketHandoffs(new URLSearchParams("make=Honda&body=Motorcycle")),
    ).toHaveLength(0);
  });
  it("carries the supported seller selector and discloses rounded distance", () => {
    const primary = new URL(
      marketHandoff(new URLSearchParams("sellerType=private")).href,
    );
    expect(primary.searchParams.get("saleby")).toBe("private");
    const cars = marketHandoffs(
      new URLSearchParams("make=Honda&zip=60601&radius=60"),
    ).find((r) => r.id === "cars_com")!;
    expect(new URL(cars.href).searchParams.get("maximum_distance")).toBe("75");
    expect(cars.reapply.join(" ")).toContain("distance options differ");
    expect(cars.carried).not.toContain("Radius (mi): 60");
    const cl = marketHandoffs(
      new URLSearchParams("make=Honda&zip=60601&radius=99999"),
    ).find((r) => r.id === "craigslist")!;
    expect(cl.carried).toContain("Radius (mi): 500");
    expect(cl.carried.join(" ")).not.toContain("99999");
  });
});
