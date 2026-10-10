import { describe, expect, it } from "vitest";
import { marketHandoff } from "./market-handoff";

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
    expect(result.reapply).toContain("maxPrice: NaN");
    expect(result.reapply).toContain("state: XX");
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
    expect(result.reapply).toEqual(["token: private"]);
  });
});
