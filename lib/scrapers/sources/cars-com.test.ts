import { describe, it, expect } from "vitest";
import { parseCarsComHtml } from "./cars-com";

// Build a fuse-card the way cars.com renders it: data-vehicle-details holds entity-encoded JSON.
function card(v: Record<string, unknown>): string {
  const json = JSON.stringify(v).replace(/"/g, "&quot;");
  return `<fuse-card data-listing-id="${v.listingId}" data-vehicle-details="${json}"></fuse-card>`;
}

describe("parseCarsComHtml", () => {
  it("extracts a used listing from data-vehicle-details JSON", () => {
    const html = card({
      listingId: "abc-123",
      year: "2018",
      make: "Ford",
      model: "F-150",
      trim: "XLT",
      vin: "1FTEW1EP5JFA00000",
      mileage: "60000",
      price: "28000",
      bodyStyle: "Truck",
      stockType: "Used",
      primaryThumbnail: "https://images.cars.com/x.jpg",
    });
    const items = parseCarsComHtml(html, "TX");
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("cars_com");
    expect(d.make).toBe("Ford");
    expect(d.model).toBe("F-150");
    expect(d.trim).toBe("XLT");
    expect(d.vin).toBe("1FTEW1EP5JFA00000");
    expect(d.asking_price).toBe(28000);
    expect(d.odometer).toBe(60000);
    expect(d.condition).toBe("clean");
    expect(d.images).toEqual(["https://images.cars.com/x.jpg"]);
  });

  it("skips New stock and rows without a price/vin", () => {
    const html =
      card({
        listingId: "1",
        year: "2026",
        make: "Ford",
        model: "Bronco",
        vin: "X",
        price: "60000",
        stockType: "New",
      }) +
      card({
        listingId: "2",
        year: "2019",
        make: "Honda",
        model: "Civic",
        vin: "",
        price: "15000",
        stockType: "Used",
      }) +
      card({
        listingId: "3",
        year: "2019",
        make: "Honda",
        model: "Accord",
        vin: "Y",
        price: "",
        stockType: "Used",
      });
    expect(parseCarsComHtml(html)).toHaveLength(0);
  });

  it("maps certified stock to the certified condition", () => {
    const html = card({
      listingId: "c1",
      year: "2021",
      make: "Lexus",
      model: "ES",
      vin: "JTHB1234567890000",
      price: "33000",
      stockType: "Certified",
    });
    expect(parseCarsComHtml(html)[0].condition).toBe("certified");
  });
});
