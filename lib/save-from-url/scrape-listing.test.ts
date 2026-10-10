import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

vi.mock("dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { lookup, default: { lookup } };
});

import { scrapeOrParseListing } from "./scrape-listing";

describe("scrapeOrParseListing", () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it("does not invent a shared deal from URL tokens when the fetch fails", async () => {
    axiosGet.mockRejectedValueOnce(new Error("blocked"));
    const listing = await scrapeOrParseListing(
      "https://listings.example/2018-ford-f150/15000/",
      "web-share",
    );
    expect(listing).toBeNull();
  });

  it("does not use a path number as the ask even when the page loads", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: "<html><title>2018 Ford F150</title><body>no price</body></html>",
    });
    const listing = await scrapeOrParseListing(
      "https://listings.example/2018-ford-f150/15000/",
      "web-share",
    );
    expect(listing).toBeNull();
  });

  it("keeps an ask that was actually on the page", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: `<html><span class="price">$18,400</span><span id="titletextonly">2018 Ford F-150</span></html>`,
    });
    const listing = await scrapeOrParseListing(
      "https://listings.example/2018-ford-f150/",
      "craigslist",
    );
    expect(listing).toMatchObject({ make: "Ford", ask_price: 18400, year: 2018 });
  });

  it("reads year, make, model, price, miles and VIN from schema.org JSON-LD", async () => {
    const ld = {
      "@context": "https://schema.org",
      "@type": "Car",
      name: "2019 Toyota Tacoma SR5",
      brand: { "@type": "Brand", name: "Toyota" },
      model: "Tacoma",
      vehicleModelDate: "2019",
      vehicleIdentificationNumber: "3TMCZ5AN0KM000000",
      mileageFromOdometer: { value: 64000, unitCode: "SMI" },
      offers: { price: 27900, priceCurrency: "USD" },
    };
    axiosGet.mockResolvedValueOnce({
      status: 200,
      headers: {},
      data: `<html><script type="application/ld+json">${JSON.stringify(ld)}</script><body>car</body></html>`,
    });
    const listing = await scrapeOrParseListing(
      "https://dealer.example/inventory/used-truck-123",
      "web-share",
    );
    expect(listing).toMatchObject({
      year: 2019,
      make: "Toyota",
      model: "Tacoma",
      ask_price: 27900,
      mileage: 64000,
      vin: "3TMCZ5AN0KM000000",
    });
  });
});
