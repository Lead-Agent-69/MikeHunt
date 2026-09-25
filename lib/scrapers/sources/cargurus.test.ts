import { describe, it, expect } from "vitest";
import { parseCargurusListings } from "./cargurus";

// Verifies the PARSE LOGIC (field mapping + defensive fallbacks). The live field names still need a
// one-time verification against a real FlareSolverr fetch, but this locks in the mapping + safety.

describe("parseCargurusListings", () => {
  it("parses the AJAX JSON listings array", () => {
    const json = JSON.stringify({
      listings: [
        {
          id: 123456,
          makeName: "Ford",
          modelName: "F-150",
          trimName: "XLT",
          carYear: 2018,
          price: 28000,
          mileage: 60000,
          vin: "1FTEW1EP5JFA00000",
          originalPhotoUrls: ["https://cargurus/x.jpg"],
          dealRating: "GREAT_PRICE",
          sellerName: "Dealer X",
        },
      ],
    });
    const items = parseCargurusListings(json);
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("cargurus");
    expect(d.make).toBe("Ford");
    expect(d.model).toBe("F-150");
    expect(d.trim).toBe("XLT");
    expect(d.year).toBe(2018);
    expect(d.ask_price).toBe(28000);
    expect(d.mileage).toBe(60000);
    expect(d.vin).toBe("1FTEW1EP5JFA00000");
    expect(d.images).toEqual(["https://cargurus/x.jpg"]);
  });

  it("handles alternate field names + string mileage defensively", () => {
    const json = JSON.stringify({
      results: [
        {
          listingId: "789",
          make: "Honda",
          model: "Accord",
          year: 2020,
          expectedPrice: 24000,
          localizedExposedMileage: "45,000 mi",
          vinNumber: "1HGCV1F30LA000000",
        },
      ],
    });
    const items = parseCargurusListings(json);
    expect(items).toHaveLength(1);
    expect(items[0].make).toBe("Honda");
    expect(items[0].ask_price).toBe(24000);
    expect(items[0].mileage).toBe(45000);
    expect(items[0].vin).toBe("1HGCV1F30LA000000");
  });

  it("extracts listings from embedded HTML JSON", () => {
    const html = `<html><script>window.__INIT={"listings":[{"id":1,"makeName":"Kia","modelName":"Telluride","carYear":2022,"price":35000,"vin":"5XYP00000"}]}</script></html>`;
    const items = parseCargurusListings(html);
    expect(items).toHaveLength(1);
    expect(items[0].model).toBe("Telluride");
  });

  it("returns [] (never throws) on junk / no listings", () => {
    expect(parseCargurusListings("not json at all")).toEqual([]);
    expect(parseCargurusListings(JSON.stringify({ listings: [] }))).toEqual([]);
    expect(
      parseCargurusListings(JSON.stringify({ listings: [{ id: 1 }] })),
    ).toEqual([]); // no price
  });
});
