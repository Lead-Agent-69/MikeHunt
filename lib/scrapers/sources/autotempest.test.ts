import { describe, it, expect } from "vitest";
import { parseAutotempest, mapOriginToSource } from "./autotempest";

const resp = (results: any[]) => ({ status: 0, results });

describe("mapOriginToSource", () => {
  it("maps each aggregator origin to our deal_source enum", () => {
    expect(mapOriginToSource("Cars.com")).toBe("cars_com");
    expect(mapOriginToSource("Carvana")).toBe("carvana");
    expect(mapOriginToSource("CarGurus")).toBe("cargurus");
    expect(mapOriginToSource("eBay")).toBe("ebay_motors");
    expect(mapOriginToSource("AutoTrader")).toBe("autotrader");
    expect(mapOriginToSource("TrueCar")).toBe("truecar");
    expect(mapOriginToSource("Facebook Marketplace")).toBe(
      "facebook_marketplace",
    );
    expect(mapOriginToSource("CarMax")).toBe("independent_dealer"); // no enum → dealer
  });
});

describe("parseAutotempest", () => {
  it("parses a real aggregator item (string price/mileage, location split, origin)", () => {
    const items = parseAutotempest(
      resp([
        {
          id: "eb-v1|307012980369|0",
          externalId: "v1|307012980369|0",
          vin: "1FTRF18L5XNB57112",
          year: "1999",
          make: "Ford",
          model: "F-150",
          trim: "",
          price: "$2,299",
          mileage: "200,000",
          location: "Quitman, AR",
          url: "https://www.ebay.com/itm/307012980369",
          sellerType: "Dealer",
          vehicleTitle: "Clean",
          sourceName: "eBay",
          sitecode: "eb",
        },
      ]),
    );
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("ebay_motors");
    expect(d.source_deal_id).toBe("at-eb-v1|307012980369|0");
    expect(d.vin).toBe("1FTRF18L5XNB57112");
    expect(d.year).toBe(1999);
    expect(d.make).toBe("Ford");
    expect(d.ask_price).toBe(2299);
    expect(d.mileage).toBe(200000);
    expect(d.condition).toBe("clean");
    expect(d.location_city).toBe("Quitman");
    expect(d.location_state).toBe("AR");
    expect(d.metadata?.origin_site).toBe("eBay");
  });

  it("maps title status to condition and routes by origin", () => {
    const items = parseAutotempest(
      resp([
        {
          id: "cm-1",
          year: "2018",
          make: "Honda",
          model: "Accord",
          price: "$21,500",
          mileage: "45,000",
          location: "Dallas, TX",
          url: "https://www.cars.com/x",
          vehicleTitle: "Salvage",
          sourceName: "Cars.com",
        },
      ]),
    );
    expect(items[0].source).toBe("cars_com");
    expect(items[0].condition).toBe("salvage_title");
  });

  it("skips items with no price or id; never throws on junk", () => {
    expect(parseAutotempest(resp([{ id: "x", make: "Ford" }]))).toEqual([]); // no price
    expect(parseAutotempest(resp([{ price: "$5,000", make: "Ford" }]))).toEqual(
      [],
    ); // no id
    expect(parseAutotempest({})).toEqual([]);
    expect(parseAutotempest(null)).toEqual([]);
  });
});
