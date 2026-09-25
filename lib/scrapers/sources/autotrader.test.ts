import { describe, it, expect } from "vitest";
import { parseAutotraderNextData } from "./autotrader";

function page(inventory: Record<string, unknown>): string {
  const nd = { props: { pageProps: { __eggsState: { inventory } } } };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(
    nd,
  )}</script></body></html>`;
}

describe("parseAutotraderNextData", () => {
  it("extracts used listings from __NEXT_DATA__ inventory", () => {
    const html = page({
      "775": {
        listingType: "USED",
        vin: "1HGCV1F30JA000000",
        year: 2019,
        make: { name: "Honda" },
        model: { name: "Accord" },
        atTrim: "EX-L",
        mileage: { value: "45000" },
        pricingDetail: { displayPrice: 24000 },
        images: { sources: [{ src: "https://images.autotrader.com/y.jpg" }] },
        ownerName: "Dealer X",
        vdpBaseUrl: "/cars-for-sale/vehicle/775",
      },
    });
    const items = parseAutotraderNextData(html);
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("autotrader");
    expect(d.make).toBe("Honda");
    expect(d.model).toBe("Accord");
    expect(d.trim).toBe("EX-L");
    expect(d.vin).toBe("1HGCV1F30JA000000");
    expect(d.ask_price).toBe(24000);
    expect(d.mileage).toBe(45000);
    expect(d.condition).toBe("clean");
    expect(d.source_url).toContain("autotrader.com");
  });

  it("skips New listings and survives a non-string trim object", () => {
    const html = page({
      a: {
        listingType: "NEW",
        vin: "NEW000",
        year: 2026,
        make: { name: "Ford" },
        model: { name: "Bronco" },
        pricingDetail: { displayPrice: 60000 },
      },
      b: {
        listingType: "USED",
        vin: "USED111",
        year: 2020,
        make: { name: "Toyota" },
        model: { name: "Tacoma" },
        trim: { id: 5 }, // object, not a string — must not crash
        mileage: { value: "30000" },
        pricingDetail: { displayPrice: 31000 },
      },
    });
    const items = parseAutotraderNextData(html);
    expect(items).toHaveLength(1);
    expect(items[0].vin).toBe("USED111");
    expect(items[0].trim).toBeUndefined();
  });

  it("uses explicit listing location when present", () => {
    const html = page({
      x: {
        listingType: "USED",
        vin: "USED222",
        year: 2021,
        make: { name: "Kia" },
        model: { name: "Telluride" },
        mileage: { value: "20000" },
        pricingDetail: { displayPrice: 35000 },
        owner: { city: "Austin", state: "TX" },
      },
    });
    const d = parseAutotraderNextData(html, "30301")!; // seed is GA — explicit TX must win
    expect(d[0].location_city).toBe("Austin");
    expect(d[0].location_state).toBe("TX");
  });

  it("falls back to the search-region state (seed ZIP) when the listing has no location", () => {
    const html = page({
      y: {
        listingType: "USED",
        vin: "USED333",
        year: 2020,
        make: { name: "Subaru" },
        model: { name: "Outback" },
        mileage: { value: "40000" },
        pricingDetail: { displayPrice: 22000 },
      },
    });
    // 77002 = Houston, TX → the car with no explicit location gets TX (better than null).
    const d = parseAutotraderNextData(html, "77002")!;
    expect(d[0].location_state).toBe("TX");
    // No seed ZIP → stays undefined (no fabrication).
    expect(parseAutotraderNextData(html)[0].location_state).toBeUndefined();
  });

  it("returns [] when there is no __NEXT_DATA__", () => {
    expect(parseAutotraderNextData("<html>nope</html>")).toEqual([]);
  });
});
