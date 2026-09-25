import { describe, it, expect } from "vitest";
import {
  extractJsonLd,
  extractEmbeddedJson,
  firstNonEmpty,
} from "./structured-extract";

describe("structured-extract (extraction fallback ladder)", () => {
  it("pulls a vehicle out of schema.org JSON-LD (survives a markup redesign)", () => {
    const html = `<html><head>
      <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Car",
        name: "2015 Toyota Tacoma PreRunner",
        vehicleIdentificationNumber: "5TFJU4GN9FX000000",
        vehicleModelDate: "2015",
        brand: { "@type": "Brand", name: "Toyota" },
        model: "Tacoma",
        mileageFromOdometer: { "@type": "QuantitativeValue", value: 88000 },
        offers: { "@type": "Offer", price: "18995", priceCurrency: "USD" },
        url: "https://x.com/lot/1",
      })}</script></head><body>garbled unparseable markup</body></html>`;
    const items = extractJsonLd(html);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      make: "Toyota",
      model: "Tacoma",
      year: 2015,
      vin: "5TFJU4GN9FX000000",
      mileage: 88000,
      price: 18995,
    });
  });

  it("pulls a property out of JSON-LD + handles @graph arrays", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [
        { "@type": "WebPage" },
        {
          "@type": "SingleFamilyResidence",
          name: "123 Main St",
          address: {
            streetAddress: "123 Main St",
            addressLocality: "Dallas",
            addressRegion: "TX",
            postalCode: "75201",
          },
          numberOfBedrooms: 3,
          offers: { price: 145000 },
        },
      ],
    })}</script>`;
    const items = extractJsonLd(html);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      city: "Dallas",
      state: "TX",
      zip: "75201",
      beds: 3,
      price: 145000,
    });
  });

  it("ignores malformed JSON-LD blocks without throwing", () => {
    const html = `<script type="application/ld+json">{ not valid json,,, </script>`;
    expect(extractJsonLd(html)).toHaveLength(0);
  });

  it("extracts listings from a __NEXT_DATA__ hydration blob", () => {
    const blob = {
      props: {
        pageProps: {
          listing: {
            vin: "1FTFW1ET5DFA00000",
            price: 22000,
            year: 2013,
            make: "Ford",
            model: "F-150",
          },
        },
      },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(blob)}</script>`;
    const items = extractEmbeddedJson(html);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0].make).toBe("Ford");
  });

  it("firstNonEmpty returns the first tier that yields data + reports the winner", async () => {
    const wins: string[] = [];
    const out = await firstNonEmpty<number>(
      [
        { name: "css", run: () => [] },
        { name: "jsonld", run: async () => [1, 2, 3] },
        { name: "ai", run: () => [9] },
      ],
      (name) => wins.push(name),
    );
    expect(out).toEqual([1, 2, 3]);
    expect(wins).toEqual(["jsonld"]); // stopped at jsonld, never reached ai
  });

  it("firstNonEmpty skips a throwing tier and continues", async () => {
    const out = await firstNonEmpty<number>([
      {
        name: "boom",
        run: async () => {
          throw new Error("selector broke");
        },
      },
      { name: "fallback", run: () => [42] },
    ]);
    expect(out).toEqual([42]);
  });
});
