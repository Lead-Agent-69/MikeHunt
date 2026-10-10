import { describe, it, expect } from "vitest";
import { parseMunicibidHtml } from "./municibid";

// Mirrors the real Municibid Automotive card markup: a data-listingid wrapper, an inline <style> block,
// the /Listing/Details link with a year-make-model slug, an image, and the cleaned-text bid/location row.
function card(
  id: string,
  slug: string,
  body: string,
  img = `https://storagemunicibidpro.blob.core.windows.net/assets/media/${id}_thumbcrop.jpg`,
) {
  return `
    <div data-listingid="${id}">
      <style>.x{color:red}</style>
      <a href="/Listing/Details/${id}/${slug}">${slug.replace(/-/g, " ")}</a>
      <img src="${img}" />
      <div>${body}</div>
    </div>`;
}

const HTML = `<html><body>
${card(
  "83960478",
  "2016-Ford-Explorer-Police-Interceptor",
  "2016 Ford Explorer Police Interceptor Perkasie, PA | Bedminster Township BIDS: 10 CURRENT BID: $ 775.00 Ended: 7/6/2026 11:00:00 AM",
)}
${card(
  "83960478",
  "2016-Ford-Explorer-Police-Interceptor",
  "duplicate occurrence with no price",
)}
${card(
  "84033793",
  "2009-Ford-F350",
  "2009 Ford F350 Jersey Shore, PA | Tiadaghton Valley MA BIDS: 0 CURRENT BID: $ 750.00 Ends: 7/10/2026 11:06:00 AM",
)}
${card(
  "84099999",
  "2-GM-8-Lug-Dually-Wheels",
  "2 GM 8-Lug Dually Wheels Somewhere, PA | Some Township BIDS: 1 CURRENT BID: $ 20.00 Ends: 7/9/2026 9:00:00 AM",
)}
</body></html>`;

describe("parseMunicibidHtml", () => {
  const deals = parseMunicibidHtml(HTML);

  it("parses vehicle cards into gov_auction deals", () => {
    const d = deals.find((x) => x.source_deal_id === "mb-83960478")!;
    expect(d).toBeTruthy();
    expect(d.source).toBe("gov_auction");
    expect(d.source_url).toBe("https://municibid.com/Listing/Details/83960478");
    expect(d.year).toBe(2016);
    expect(d.make).toBe("Ford");
    expect(d.ask_price).toBe(775);
    expect(d.location_city).toBe("Perkasie");
    expect(d.location_state).toBe("PA");
    expect(d.seller).toBe("Bedminster Township");
    expect(d.bid_count).toBe(10);
    expect(d.images?.[0]).toContain("storagemunicibid");
    expect(d.auction_end).toBeTruthy();
  });

  it("dedupes repeated listing ids (keeps the priced occurrence)", () => {
    expect(
      deals.filter((d) => d.source_deal_id === "mb-83960478"),
    ).toHaveLength(1);
  });

  it("skips non-vehicle lots with no model year (parts/wheels)", () => {
    expect(
      deals.find((d) => d.source_deal_id === "mb-84099999"),
    ).toBeUndefined();
  });

  it("strips title bleed from the city (just the real city name)", () => {
    const f350 = deals.find((d) => d.source_deal_id === "mb-84033793")!;
    expect(f350.location_city).toBe("Jersey Shore");
    expect(f350.location_state).toBe("PA");
  });
});

describe("parseMunicibidHtml — 2026-10 listing-row layout", () => {
  const row = (
    id: string,
    slug: string,
    title: string,
    where: string,
    agency: string,
    bid: string,
  ) =>
    `<article class="listing-row"><a class="listing-row__photo-link" href="/listing/${id}/${slug}"><img src="https://storagemunicibidpro.blob.core.windows.net/assets/media/${id}_thumbcrop.jpg" alt=""/></a><div class="listing-row__body"><h3 class="listing-row__title"><a href="/listing/${id}/${slug}">${title}</a></h3><p class="listing-row__where"><span>${where}</span><span class="listing-row__sep">|</span><a class="listing-row__agency" href="/seller/x">${agency}</a></p><p class="listing-row__bidline"><span><strong>Bid(s):</strong> <!-- -->9</span><span class="listing-row__sep">|</span><span><strong>Current Bid:</strong> <!-- -->${bid}</span></p></div></article>`;

  it("parses cards and keeps cars and trucks only", () => {
    const html =
      row(
        "85587978",
        "2020-ford-explorer-police-package",
        "2020 Ford Explorer: Police Package",
        "East Lansdowne, PA",
        "East Lansdowne Police",
        "$8,300.00",
      ) +
      row(
        "85000001",
        "2008-bobcat-s185-skid-steer",
        "2008 Bobcat S185 Skid Steer",
        "Hull, WI",
        "Town of Hull",
        "$4,000.00",
      ) +
      row(
        "85000002",
        "2012-utility-trailer",
        "2012 Utility Trailer",
        "Hull, WI",
        "Town of Hull",
        "$400.00",
      );
    const out = parseMunicibidHtml(html);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source_deal_id: "mb-85587978",
      title: "2020 Ford Explorer Police Package",
      year: 2020,
      make: "Ford",
      ask_price: 8300,
      location_city: "East Lansdowne",
      location_state: "PA",
      seller: "East Lansdowne Police",
      bid_count: 9,
      source_url:
        "https://municibid.com/listing/85587978/2020-ford-explorer-police-package",
    });
  });
});
