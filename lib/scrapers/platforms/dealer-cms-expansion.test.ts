import { load } from "cheerio";
import { describe, expect, it, vi } from "vitest";
import { CURATED_SITES } from "../curated-sites";
import {
  dealerSourceOptions,
  matchesRequestedDealer,
} from "@/lib/sources/source-meta";
import {
  crawlDealerCms,
  dealerCmsSiteFor,
  dealerCmsSiteFromCurated,
  parseListingPage,
  parsePrice,
  type DealerCmsSite,
} from "./dealer-cms";

const site: DealerCmsSite = {
  sourceId: "example",
  name: "Example",
  baseUrl: "https://dealer.example",
  inventoryUrl: "https://dealer.example/vehicles.php",
  state: "MO",
  defaultCondition: "unknown",
};
const card = (
  id: number,
  images = '<img src="/car.jpg">',
  title = "2024 Ford Escape",
) =>
  `<article><a href="vehiclesDetail.php?${id}">${images}<h3>${title}</h3></a><p>Sale Price: $18,995</p></article>`;

describe("bounded source expansion", () => {
  it.each([
    "Sale price: $299/month",
    "Monthly sale price: $299",
    "Savings off sale price: $2,180",
  ])("rejects payment and savings labels in dealer cards: %s", (text) => {
    expect(parsePrice(text)).toBeUndefined();
  });
  it("ignores savings off a price and finds the actual full amount", () => {
    expect(
      parsePrice("Savings off sale price: $2,180. Full price: $18,995"),
    ).toBe(18995);
  });
  it("places Polecats at its published single-lot city for radius searches", () => {
    const polecats = CURATED_SITES.find((s) =>
      s.url.includes("polecatsautosales.com"),
    )!;
    expect(polecats).toMatchObject({ city: "Malden", state: "MO" });
    expect(dealerCmsSiteFor(polecats.url)).toMatchObject({
      city: "Malden",
      state: "MO",
    });
  });

  it("connects verified Missouri inventory and selectable source identity", () => {
    const cameron = CURATED_SITES.find((s) =>
      s.url.includes("cameronautollc.com"),
    )!;
    expect(dealerCmsSiteFromCurated(cameron)).toMatchObject({
      sourceId: "4cdg-cameronautollc-com",
      state: "MO",
      city: "Kahoka",
      inventoryUrl: "https://www.cameronautollc.com/vehicles.php",
    });
    expect(matchesRequestedDealer(cameron, ["4cdg-cameronautollc-com"])).toBe(
      true,
    );
    const travers = CURATED_SITES.find((s) =>
      s.url.includes("traversautomotivegroup.com"),
    )!;
    expect(travers.inventoryUrl).toBe(
      "https://www.traversautomotivegroup.com/used",
    );
    expect(matchesRequestedDealer(travers, ["travers-automotive"])).toBe(true);
    expect(
      dealerSourceOptions().find((s) => s.id === "travers-automotive")?.label,
    ).toBe("Travers Automotive Group");
    expect(
      CURATED_SITES.find((s) => s.url.includes("southsiderebuilders.com"))
        ?.inventoryUrl,
    ).toContain("all-vehicles.php");
  });

  it("reads the vehicle photo instead of lazy placeholders or status artwork", () => {
    const parsed = parseListingPage(
      load(
        card(
          1,
          '<img src="/images/pending.png"><img src="data:image/gif;base64,x" data-src="/photos/1.jpg">',
        ),
      ),
      site.inventoryUrl,
    );
    expect(parsed.cards[0].image).toBe("https://dealer.example/photos/1.jpg");
    expect(
      parseListingPage(
        load(card(2, '<img src="/no-image.jpg">')),
        site.inventoryUrl,
      ).cards[0].image,
    ).toBeUndefined();
    expect(
      parseListingPage(
        load(card(3, '<img src="javascript:alert(1)">')),
        site.inventoryUrl,
      ).cards[0].image,
    ).toBeUndefined();
  });

  it("does not import an explicitly pending vehicle", async () => {
    const rows = await crawlDealerCms(site, {
      load,
      fetchHtml: async () => ({
        ok: true,
        status: 200,
        body: card(1, undefined, "2024 Ford Escape (PENDING)"),
      }),
    });
    expect(rows).toEqual([]);
  });

  it("follows cursor-only pagination without inventing page parameters and stops loops", async () => {
    const fetchHtml = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      body: url.includes("cursor=two")
        ? card(2) + '<a rel="next" href="?cursor=two">Next</a>'
        : card(1) + '<a rel="next" href="?cursor=two">Next</a>',
    }));
    expect(await crawlDealerCms(site, { load, fetchHtml })).toHaveLength(2);
    expect(fetchHtml.mock.calls.map((c) => c[0])).toEqual([
      site.inventoryUrl,
      "https://dealer.example/vehicles.php?cursor=two",
    ]);
  });

  it.each([
    "https://evil.example/vehicles.php?cursor=2",
    "#",
    "javascript:void(0)",
  ])("rejects unsafe continuation %s", async (href) => {
    const fetchHtml = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: card(1) + `<a rel="next" href="${href}">Next</a>`,
    }));
    await crawlDealerCms(site, { load, fetchHtml });
    expect(fetchHtml).toHaveBeenCalledTimes(1);
  });

  it("retains the hard page cap and single-page contract", async () => {
    for (const config of [
      { ...site, maxPages: 2 },
      { ...site, singlePage: true },
    ]) {
      let id = 0;
      const fetchHtml = vi.fn(async () => ({
        ok: true,
        status: 200,
        body: card(++id) + `<a rel="next" href="?cursor=${id}">Next</a>`,
      }));
      await crawlDealerCms(config, { load, fetchHtml });
      expect(fetchHtml).toHaveBeenCalledTimes(config.singlePage ? 1 : 2);
    }
  });
});
