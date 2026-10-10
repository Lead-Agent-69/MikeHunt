import { describe, it, expect } from "vitest";
import { expandFreeTextQuery } from "./expand-free-text";

const run = (qs: string) => Object.fromEntries(expandFreeTextQuery(new URLSearchParams(qs)));

describe("expandFreeTextQuery (free-text q returned 0)", () => {
  it("turns 'honda civic under 15000' into filters", () => {
    expect(run("q=honda civic under 15000")).toMatchObject({
      q: "",
      make: "Honda",
      model: "Civic",
      maxPrice: "15000",
    });
  });

  it("never overrides explicit params", () => {
    expect(run("q=honda civic under 15000&maxPrice=9000").maxPrice).toBe("9000");
  });

  it("keeps a plain word query as-is and leaves VINs alone", () => {
    expect(run("q=sienna")).toEqual({ q: "sienna" });
    expect(run("q=1HGCM82633A004352")).toEqual({ q: "1HGCM82633A004352" });
  });

  it("keeps unknown model words when only filters are recognized", () => {
    expect(run("q=sienna under 20k").q).toBe("sienna");
  });

  it("maps a bare ZIP to its state when no radius is given", () => {
    expect(run("q=honda civic near 60601")).toMatchObject({ zip: "60601", state: "IL" });
  });
});
