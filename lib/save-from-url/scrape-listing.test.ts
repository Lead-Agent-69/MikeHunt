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

  it("hashes the canonical URL: tracking params and fragment don't mint a new listing id (Ren #312 P2)", async () => {
    const page = {
      status: 200,
      headers: {},
      data: `<html><span class="price">$18,400</span><span id="titletextonly">2018 Ford F-150</span></html>`,
    };
    const ids: string[] = [];
    for (const url of [
      "https://listings.example/2018-ford-f150/",
      "https://www.listings.example/2018-ford-f150?utm_source=fb&utm_medium=share&fbclid=abc#photos",
      "https://listings.example/2018-ford-f150?gclid=xyz",
    ]) {
      axiosGet.mockResolvedValueOnce(page);
      const listing = await scrapeOrParseListing(url, "craigslist");
      ids.push(String(listing?.external_id));
    }
    expect(new Set(ids).size).toBe(1);
    axiosGet.mockResolvedValueOnce(page);
    const other = await scrapeOrParseListing(
      "https://listings.example/2018-ford-f150?vehicle=2",
      "craigslist",
    );
    expect(other?.external_id).not.toBe(ids[0]);
  });
});
