import { describe, it, expect } from "vitest";
import { parseCarsComHtml, resolveCarsComStates } from "./cars-com";
import { withScrapeRunScope } from "../run-scope-context";

function card(v: Record<string, unknown>, body = ""): string {
  const json = JSON.stringify(v).replace(/"/g, "&quot;");
  return `<fuse-card data-listing-id="${v.listingId}" data-vehicle-details="${json}">${body}</fuse-card>`;
}

const used = {
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
};

describe("parseCarsComHtml", () => {
  it("extracts a used listing and takes state from the card, not the search seed", () => {
    const html = card(
      used,
      `<div><fuse-svg name="map-marker-outline"></fuse-svg>Libertyville, IL (31 mi)</div>`,
    );
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
    expect(d.location_city).toBe("Libertyville");
    expect(d.location_state).toBe("IL");
  });

  it("uses a listing ZIP and ignores the search seed", () => {
    const html = card({ ...used, listingId: "z1", dealerZip: "78752" });
    const items = parseCarsComHtml(html, "FL");
    expect(items).toHaveLength(1);
    expect(items[0].location_state).toBe("TX");
  });

  it("drops a row that has no listing state", () => {
    const html = card(used);
    expect(parseCarsComHtml(html, "TX")).toEqual([]);
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
        dealerState: "TX",
      }) +
      card({
        listingId: "2",
        year: "2019",
        make: "Honda",
        model: "Civic",
        vin: "",
        price: "15000",
        stockType: "Used",
        dealerState: "TX",
      }) +
      card({
        listingId: "3",
        year: "2019",
        make: "Honda",
        model: "Accord",
        vin: "Y",
        price: "",
        stockType: "Used",
        dealerState: "TX",
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
      dealerState: "CA",
    });
    expect(parseCarsComHtml(html)[0].condition).toBe("certified");
    expect(parseCarsComHtml(html)[0].location_state).toBe("CA");
  });
});

describe("resolveCarsComStates", () => {
  it("does not walk every state when CARS_STATES is unset and nothing is saved", () => {
    expect(resolveCarsComStates("")).toEqual([]);
    expect(resolveCarsComStates(undefined)).toEqual([]);
  });

  it("uses one saved buyer state", async () => {
    await withScrapeRunScope({ state: "fl", states: ["GA", "AL"] }, async () => {
      expect(resolveCarsComStates("")).toEqual(["FL"]);
    });
    await withScrapeRunScope({ states: ["ok", "tx"] }, async () => {
      expect(resolveCarsComStates(undefined)).toEqual(["OK"]);
    });
  });

  it("lets CARS_STATES override the saved state", async () => {
    await withScrapeRunScope({ state: "FL" }, async () => {
      expect(resolveCarsComStates("tx, no, ok")).toEqual(["TX", "OK"]);
    });
  });
});
