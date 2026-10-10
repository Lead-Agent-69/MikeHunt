import { describe, expect, it } from "vitest";
import { parseCheckListingBody } from "./check-listing-input";
import { readForDesk } from "./check-listing-data";
import { readListing } from "./check-listing";

describe("check any listing: one input", () => {
  it("a pasted link is a URL check", () => {
    expect(parseCheckListingBody({ q: "https://www.cars.com/vehicledetail/123/" })).toMatchObject({
      url: "https://www.cars.com/vehicledetail/123/",
    });
  });
  it("free text gives year, make, model, miles, price, ZIP and title", () => {
    const r = parseCheckListingBody({ q: "2018 Honda Civic EX 71k mi $9,500 60432 salvage" });
    expect(r).toMatchObject({
      url: null,
      fields: { year: 2018, make: "Honda", model: "Civic EX", mileage: 71000, price: 9500, zip: "60432", title: "salvage" },
    });
  });
  it("a VIN alone is enough to start", () => {
    expect(parseCheckListingBody({ q: "1hgcv1f30la000000" })).toMatchObject({
      fields: { vin: "1HGCV1F30LA000000" },
    });
  });
  it("structured fields win over the text", () => {
    const r = parseCheckListingBody({ q: "2018 Honda Civic $9,500", price: "8,900", zip: "75001" });
    expect(r).toMatchObject({ fields: { price: 8900, zip: "75001", make: "Honda" } });
  });
  it("rejects nothing-to-check and non-http links", () => {
    expect(parseCheckListingBody({})).toHaveProperty("error");
    expect(parseCheckListingBody({ url: "file:///etc/passwd" })).toHaveProperty("error");
  });
});

describe("desk gate", () => {
  const NOW = Date.parse("2026-10-10T12:00:00Z");
  const comps = [15000, 15500, 16000, 15200].map((price, i) => ({
    id: `c${i}`,
    price,
    kind: "ask" as const,
    state: "IL",
    year: 2018,
    observedAt: new Date(NOW - (i + 1) * 86_400_000).toISOString(),
    title: "clean_title",
  }));
  const base = { year: 2018, make: "Honda", model: "Civic", state: "IL", title: "clean" };

  it("flip desk keeps profit and where to sell", () => {
    const r = readForDesk(readListing({ ...base, price: 9000 }, comps, { now: NOW }), true);
    expect(r.profit.net).not.toBeNull();
    expect(r.resale.value).not.toBeNull();
  });
  it("personal desk: Buy ≤ is fair value, no profit or resale market", () => {
    const flip = readListing({ ...base, price: 14000 }, comps, { now: NOW });
    const r = readForDesk(flip, false);
    expect(r.profit.net).toBeNull();
    expect(r.resale.value).toBeNull();
    expect(r.resale.state).toBeNull();
    expect(r.maxBuy.value).toBe(Math.floor(flip.fairValue.value! / 50) * 50);
    expect(r.verdict).toBe("buy");
    expect(r.why.some((w) => w.startsWith("After fees"))).toBe(false);
  });
  it("personal desk: overpriced is Pass with the gap", () => {
    const r = readForDesk(readListing({ ...base, price: 18000 }, comps, { now: NOW }), false);
    expect(r.verdict).toBe("pass");
    expect(r.headline).toMatch(/Overpriced by about \$/);
  });
});
