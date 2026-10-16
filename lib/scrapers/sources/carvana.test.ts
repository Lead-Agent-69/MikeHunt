import { describe, it, expect } from "vitest";
import { parseCarvanaVehicles } from "./carvana";

// Shape mirrors the real apik.carvana.io /merch/search/api/v2/search response (inventory.vehicles).
const resp = (vehicles: any[]) => ({ inventory: { pagination: {}, vehicles } });

describe("parseCarvanaVehicles", () => {
  it("maps a real vehicle object (prefers parentModel, price.total)", () => {
    const items = parseCarvanaVehicles(
      resp([
        {
          stockNumber: 2004375511,
          vehicleId: 4097314,
          make: "Chevrolet",
          parentModel: "Silverado 2500",
          model: "Silverado 2500 HD Crew Cab",
          trim: "Custom 6 1/2 ft",
          kbbTrim: "Custom Pickup 4D",
          year: 2021,
          mileage: 34427,
          vin: "1GC4YME77MF000000",
          vdpSlug: "2021-chevrolet-silverado-2500",
          imageUrl: "https://carvana/x.jpg",
          price: { total: 51990.0, msrp: 54395.0, incentivizedPrice: 51990.0 },
        },
      ]),
    );
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("carvana");
    expect(d.vin).toBe("1GC4YME77MF000000");
    expect(d.year).toBe(2021);
    expect(d.make).toBe("Chevrolet");
    expect(d.model).toBe("Silverado 2500"); // parentModel preferred
    expect(d.trim).toBe("Custom 6 1/2 ft");
    expect(d.ask_price).toBe(51990);
    expect(d.mileage).toBe(34427);
    expect(d.condition).toBe("clean");
    expect(d.source_url).toBe("https://www.carvana.com/vehicle/4097314");
    expect(d.images).toEqual(["https://carvana/x.jpg"]);
  });

  it("falls back to model and disclosed sale price, and builds a vehicleId URL", () => {
    const items = parseCarvanaVehicles(
      resp([
        {
          vehicleId: 555,
          make: "Honda",
          model: "Accord",
          kbbTrim: "EX-L",
          year: 2020,
          mileage: 40000,
          vin: "1HGCV1F30LA000000",
          price: { incentivizedPrice: 24000, msrp: 32000 },
          jellyBeanDesktopUrl: "https://carvana/jelly.png",
        },
      ]),
    );
    expect(items).toHaveLength(1);
    expect(items[0].model).toBe("Accord");
    expect(items[0].trim).toBe("EX-L");
    expect(items[0].ask_price).toBe(24000);
    expect(items[0].source_url).toBe("https://www.carvana.com/vehicle/555");
    expect(items[0].images).toEqual(["https://carvana/jelly.png"]);
  });

  it("prefers the absolute vehicle hero over relative paths and stock artwork", () => {
    const [deal] = parseCarvanaVehicles(
      resp([
        {
          vehicleId: 4787555,
          vin: "JF1VA2T6XJ9816151",
          price: { total: 27990 },
          imageUrl: "/3006562099/post-large/normalized/zoomcrop/photo.jpg?v=1",
          standardizedHero:
            "https://vexgateway.fastly.carvana.io/3006562099/standardizedHero.jpg",
          jellyBeanDesktopUrl:
            "https://vexstockimages.fastly.carvana.io/stock.png",
        },
      ]),
    );
    expect(deal.images).toEqual([
      "https://vexgateway.fastly.carvana.io/3006562099/standardizedHero.jpg",
    ]);
    expect(deal.options?.priceEvidence).toMatchObject({
      kind: "asking",
      askingPrice: 27990,
    });
  });

  it("never treats MSRP as the seller's asking price", () => {
    expect(
      parseCarvanaVehicles(
        resp([{ vehicleId: 555, vin: "X", price: { msrp: 24000 } }]),
      ),
    ).toEqual([]);
  });

  it("skips vehicles missing vin or price; never throws on junk", () => {
    expect(parseCarvanaVehicles(resp([{ vin: "X", price: {} }]))).toEqual([]); // no price
    expect(parseCarvanaVehicles(resp([{ price: { total: 20000 } }]))).toEqual(
      [],
    ); // no vin
    expect(parseCarvanaVehicles({})).toEqual([]);
    expect(parseCarvanaVehicles(null)).toEqual([]);
    expect(parseCarvanaVehicles({ inventory: { vehicles: "nope" } })).toEqual(
      [],
    );
  });
});
