import { describe, it, expect } from "vitest";
import {
  autotempestListingKey,
  parseAutotempest,
  mapOriginToSource,
} from "./autotempest";
import { reportedAcquisitionPrice } from "@/lib/deals/acquisition-price";

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
  const base = {
    id: "sample",
    year: "2018",
    make: "Ford",
    model: "Edge",
    price: "$2,600",
    sourceName: "Cars.com",
  };
  it("normalizes source-provided relative links and never emits unsafe navigation schemes", () => {
    for (const url of [
      "//www.autotempest.com/details/abt-123",
      "/details/abt-123",
    ])
      expect(parseAutotempest(resp([{ ...base, url }]))[0].source_url).toBe(
        "https://www.autotempest.com/details/abt-123",
      );
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "https://user:pass@dealer.example/car",
      "not-a-url",
    ])
      expect(parseAutotempest(resp([{ ...base, url }]))[0].source_url).toBe("");
  });
  it.each([-2600, "-$2,600", "C $2,600", "$2,600 to $3,000"])(
    "does not turn invalid or ambiguous prices into cash: %s",
    (price) => {
      expect(parseAutotempest(resp([{ ...base, price }]))).toEqual([]);
    },
  );
  it("retains USD monthly labels and formatted auction terms", () => {
    const [payment] = parseAutotempest(resp([{ ...base, price: "299/mo" }]));
    expect(payment.options?.priceEvidence.kind).toBe("monthly_payment");
    expect(reportedAcquisitionPrice(payment)).toBe(0);
    const [auction] = parseAutotempest(
      resp([{ ...base, currentBid: "$800", buyNowPrice: "$15,995" }]),
    );
    expect(auction.options?.priceEvidence).toMatchObject({
      kind: "current_bid",
      currentBid: 800,
      buyNow: 15995,
    });
  });
  it("normalizes reported states without inventing geography", () => {
    expect(
      parseAutotempest(resp([{ ...base, location: "St. Louis, mo" }]))[0]
        .location_state,
    ).toBe("MO");
    expect(
      parseAutotempest(resp([{ ...base, location: "Unknown, ZZ" }]))[0]
        .location_state,
    ).toBeUndefined();
  });
  it("does not infer title brand, seller type, or seller name from a marketplace", () => {
    const [row] = parseAutotempest(
      resp([{ ...base, title: "Very clean Ford Edge" }]),
    );
    expect(row.condition).toBeUndefined();
    expect(row.title_source).toBeUndefined();
    expect(row.seller_type).toBeUndefined();
    expect(row.seller).toBeUndefined();
    expect(
      parseAutotempest(resp([{ ...base, vehicleTitle: "Clean interior" }]))[0]
        .condition,
    ).toBeUndefined();
    expect(parseAutotempest(resp([{ ...base, currencyCode: "CAD" }]))).toEqual(
      [],
    );
    expect(row.options).toMatchObject({
      aggregator: "autotempest",
      originSite: "Cars.com",
    });
  });
  it("preserves reported seller facts instead of using the provider as the seller", () => {
    const [row] = parseAutotempest(
      resp([
        {
          ...base,
          sellerType: "Dealer",
          sellerName: "Example Motors",
          vehicleTitle: "Clean",
        },
      ]),
    );
    expect(row.seller_type).toBe("dealer");
    expect(row.seller).toBe("Example Motors");
    expect(row.condition).toBe("clean_title");
  });
  it("keeps Craigslist dealer prices unconfirmed when only a summary is available", () => {
    const [row] = parseAutotempest(
      resp([{ ...base, sourceName: "Craigslist", sellerType: "Dealer" }]),
    );
    expect(row.source).toBe("craigslist_dealer");
    expect(reportedAcquisitionPrice(row)).toBe(0);
    expect(row.options?.priceEvidence).toMatchObject({
      kind: "unknown",
      listedAmount: 2600,
    });
  });
  it("uses an explicit Craigslist dealer channel even without a seller-type field", () => {
    const [row] = parseAutotempest(
      resp([
        {
          ...base,
          sourceName: "Craigslist",
          url: "https://kansascity.craigslist.org/ctd/d/example/123.html",
        },
      ]),
    );
    expect(row.source).toBe("craigslist_dealer");
    expect(reportedAcquisitionPrice(row)).toBe(0);
  });
  it("preserves payment disclosures and explicit current bids", () => {
    const [payment] = parseAutotempest(
      resp([
        {
          ...base,
          description: "PRICE LISTED MAY BE DOWN PAYMENT AND NOT FULL PRICE",
        },
      ]),
    );
    expect(reportedAcquisitionPrice(payment)).toBe(0);
    expect(payment.options?.priceEvidence.kind).toBe("down_payment");
    const [auction] = parseAutotempest(
      resp([{ ...base, sourceName: "eBay", currentBid: 800 }]),
    );
    expect(reportedAcquisitionPrice(auction)).toBe(800);
    expect(auction.options?.priceEvidence.kind).toBe("current_bid");
  });
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
    expect(d.condition).toBe("clean_title");
    expect(d.title_source).toBe("listing");
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

describe("autotempestListingKey", () => {
  it("deduplicates one origin listing across aggregator ids and tracking URLs", () => {
    const first = {
      source: "cars_com" as const,
      source_deal_id: "at-search-a",
      source_url:
        "https://www.cars.com/vehicledetail/abc/?utm_source=autotempest&sort=best&gclid=tracking#photos",
    };
    const second = {
      source: "cars_com" as const,
      source_deal_id: "at-search-b",
      source_url:
        "https://www.cars.com/vehicledetail/abc?sort=best&ref=autotempest",
    };

    expect(autotempestListingKey(first)).toBe(autotempestListingKey(second));
  });

  it("keeps meaningful query parameters and source boundaries distinct", () => {
    const base = {
      source: "ebay_motors" as const,
      source_deal_id: "at-eb-1",
      source_url: "https://www.ebay.com/itm/123?variation=blue",
    };

    expect(autotempestListingKey(base)).not.toBe(
      autotempestListingKey({
        ...base,
        source_url: "https://www.ebay.com/itm/123?variation=red",
      }),
    );
    expect(autotempestListingKey(base)).not.toBe(
      autotempestListingKey({ ...base, source: "independent_dealer" }),
    );
  });

  it("falls back to the aggregator id when no safe URL exists", () => {
    expect(
      autotempestListingKey({
        source: "cars_com",
        source_deal_id: "at-only-id",
        source_url: "javascript:alert(1)",
      }),
    ).toBe("cars_com|id:at-only-id");
  });
});
