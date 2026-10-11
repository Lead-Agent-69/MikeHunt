import { describe, it, expect } from "vitest";
import {
  readVehicle,
  extractFromJsonLd,
  extractFromNextData,
  genericExtract,
} from "./generic-extractor";

describe("readVehicle — shape-agnostic field reading", () => {
  it("keeps all supplied photo arrays and ImageObjects without duplicates or executable URLs", () => {
    const car = readVehicle({
      year: 2020,
      make: "Ford",
      image: [
        "https://img.example/1.jpg",
        { contentUrl: "https://img.example/2.jpg" },
        { url: "https://img.example/1.jpg" },
        "javascript:alert(1)",
      ],
      photos: [{ url: "/photos/3.jpg" }],
    })!;
    expect(car.image).toBe("https://img.example/1.jpg");
    expect(car.images).toEqual([
      "https://img.example/1.jpg",
      "https://img.example/2.jpg",
      "/photos/3.jpg",
    ]);
  });
  it("reads a flat listing object", () => {
    const v = readVehicle({
      modelYear: 2018,
      makeName: "Toyota",
      model: "Tacoma",
      listPrice: "24,995",
      odometer: 61000,
      vin: "3TMCZ5AN0JM150000",
    })!;
    expect(v.year).toBe(2018);
    expect(v.make).toBe("Toyota");
    expect(v.model).toBe("Tacoma");
    expect(v.price).toBe(24995);
    expect(v.mileage).toBe(61000);
    expect(v.vin).toBe("3TMCZ5AN0JM150000");
  });

  it("backfills year/make/model from a title-only row", () => {
    const v = readVehicle({ name: "2016 Ford Explorer Police Interceptor" })!;
    expect(v.year).toBe(2016);
    expect(v.make).toBe("Ford");
    expect(v.model).toContain("Explorer");
  });

  it("rejects non-vehicles (no year) and bad years", () => {
    expect(
      readVehicle({ name: "GM 8-Lug Dually Wheels", price: 20 }),
    ).toBeNull();
    expect(readVehicle({ year: 1700, make: "Ford" })).toBeNull();
  });
});

describe("extractFromJsonLd", () => {
  it("preserves separate cars of the same model and offer detail links", () => {
    const car = {
      "@type": "Car",
      name: "2020 Honda Accord",
      offers: { price: 15000, url: "/cars/a" },
    };
    const other = { ...car, offers: { price: 15000, url: "/cars/b" } };
    const html = `<script type="application/ld+json">${JSON.stringify([car, other, car])}</script>`;
    const rows = extractFromJsonLd(html);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.url)).toEqual(["/cars/a", "/cars/b"]);
  });
  it("reads schema.org Vehicle with nested brand + offers", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Car",
      name: "2020 Honda Accord EX",
      brand: { "@type": "Brand", name: "Honda" },
      model: "Accord",
      vehicleIdentificationNumber: "1HGCV1F30LA000000",
      mileageFromOdometer: { value: 38000 },
      offers: { "@type": "Offer", price: "27500", priceCurrency: "USD" },
    })}</script>`;
    const [v] = extractFromJsonLd(html);
    expect(v.year).toBe(2020);
    expect(v.make).toBe("Honda");
    expect(v.price).toBe(27500);
    expect(v.mileage).toBe(38000);
    expect(v.vin).toBe("1HGCV1F30LA000000");
  });

  it("reads an ItemList of listings (Municibid-style)", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: [
        { "@type": "ListItem", url: "https://x/1", name: "2013 Ford F-150" },
        { "@type": "ListItem", url: "https://x/2", name: "Office Chair Lot" },
      ],
    })}</script>`;
    const vs = extractFromJsonLd(html);
    expect(vs).toHaveLength(1); // the chair is dropped (no year/make)
    expect(vs[0].make).toBe("Ford");
    expect(vs[0].url).toBe("https://x/1");
  });
});

describe("extractFromNextData", () => {
  it("walks the __NEXT_DATA__ island for vehicle-shaped objects", () => {
    const next = {
      props: {
        pageProps: {
          listings: [
            {
              year: 2019,
              make: "Ram",
              model: "1500",
              price: 31000,
              vin: "1C6RR7LT0KS000000",
            },
            { year: 2021, make: "Subaru", model: "Outback", price: 28000 },
            { somethingElse: true },
          ],
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script>`;
    const vs = extractFromNextData(html);
    expect(vs).toHaveLength(2);
    expect(vs.map((v) => v.make).sort()).toEqual(["Ram", "Subaru"]);
  });
});

describe("genericExtract — strategy auto-pick → Deals", () => {
  it("passes the full structured gallery into ingestion", () => {
    const photos = ["https://img.example/1.jpg", "https://img.example/2.jpg"];
    const page = `<script type="application/ld+json">${JSON.stringify({ "@type": "Car", name: "2020 Ford Escape", image: photos })}</script>`;
    expect(genericExtract(page)[0].images).toEqual(photos);
  });
  it("returns Deals from a JSON-LD page", () => {
    const html = `<html><script type="application/ld+json">${JSON.stringify({
      "@type": "Vehicle",
      name: "2017 Chevrolet Silverado",
      brand: "Chevrolet",
      offers: { price: 22000 },
    })}</script></html>`;
    const deals = genericExtract(html, "newsite");
    expect(deals).toHaveLength(1);
    expect(deals[0].source).toBe("newsite");
    expect(deals[0].year).toBe(2017);
    expect(deals[0].ask_price).toBe(22000);
  });

  it("returns [] for an empty SPA shell (needs an API capture)", () => {
    const html = `<div id="root"></div><script src="/static/js/main.abc123.chunk.js"></script>`;
    expect(genericExtract(html)).toEqual([]);
  });
});
