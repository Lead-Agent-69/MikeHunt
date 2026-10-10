import { describe, expect, it } from "vitest";
import {
  applyExtendedFilters,
  hasAuctionDetailFilters,
  INVENTORY_DETAIL_FIELDS,
  readInventoryDetails,
  validateExtendedFilters,
} from "./extended-inventory-filters";

function record(search: string, now?: number) {
  const calls: unknown[][] = [];
  const query: any = {};
  for (const method of [
    "eq",
    "is",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
    "neq",
    "or",
    "ilike",
  ])
    query[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      return query;
    };
  applyExtendedFilters(query, new URLSearchParams(search), now);
  return calls;
}

describe("shared extended inventory filters", () => {
  it("distinguishes an explicitly false report from an absent report", () => {
    expect(record("runDrive=no")).toEqual([["eq", "run_drive", false]]);
    expect(record("runDrive=unknown")).toEqual([["is", "run_drive", null]]);
    expect(record("runDrive=yes")).toEqual([["eq", "run_drive", true]]);
  });

  it("uses buy-now prices, not bids or asking prices", () => {
    expect(record("minBuyNow=500&maxBuyNow=20000")).toEqual([
      ["gt", "buy_now_price", 0],
      ["gte", "buy_now_price", 500],
      ["gt", "buy_now_price", 0],
      ["lte", "buy_now_price", 20000],
    ]);
  });

  it("includes the entire auction end date in UTC", () => {
    expect(record("auctionFrom=2026-10-07&auctionTo=2026-10-08")).toEqual([
      ["gte", "auction_end_at", "2026-10-07T00:00:00.000Z"],
      ["lt", "auction_end_at", "2026-10-09T00:00:00.000Z"],
    ]);
  });

  it.each([
    "auctionFrom=2026-02-30",
    "auctionFrom=yesterday",
    "auctionFrom=2026-10-09&auctionTo=2026-10-07",
    "minBuyNow=-1",
    "maxBuyNow=3.5",
    "maxBuyNow=0",
    "minBuyNow=100&maxBuyNow=20",
    "zip=12",
    "runDrive=maybe",
    "seenWithin=90",
  ])("rejects invalid or inverted filters: %s", (search) => {
    expect(validateExtendedFilters(new URLSearchParams(search))).toBeTruthy();
  });

  it("filters listing evidence without treating unknown as no", () => {
    expect(record("hasVin=yes&hasPhotos=yes")).toEqual([
      ["not", "vin", "is", null],
      ["neq", "vin", ""],
      ["not", "images", "is", null],
      ["neq", "images", "{}"],
    ]);
    expect(record("hasVin=no&hasPhotos=no")).toEqual([
      ["or", 'vin.is.null,vin.eq.""'],
      ["or", "images.is.null,images.eq.{}"],
    ]);
  });

  it("uses observed freshness and sanitizes text matching", () => {
    expect(
      record(
        "seenWithin=7&city=Austin&engine=2.0%25",
        Date.parse("2026-10-07T12:00:00Z"),
      ),
    ).toContainEqual(["gte", "last_seen_at", "2026-09-30T12:00:00.000Z"]);
    expect(record("city=Austin&engine=2.0%25")).toContainEqual([
      "ilike",
      "engine",
      "%2.0%",
    ]);
  });

  it("recognizes explicit auction intent but not ordinary vehicle attributes", () => {
    for (const search of ["buyNow=1", "minBuyNow=0", "auctionTo=2026-10-07"])
      expect(hasAuctionDetailFilters(new URLSearchParams(search))).toBe(true);
    expect(
      hasAuctionDetailFilters(new URLSearchParams("runDrive=yes&color=red")),
    ).toBe(false);
  });

  it("hydrates only supported nonempty fields and has unique field identifiers", () => {
    expect(
      readInventoryDetails(
        new URLSearchParams("color=red&engine=&keys=all&random=yes"),
      ),
    ).toEqual({ color: "red" });
    expect(
      new Set(INVENTORY_DETAIL_FIELDS.map((field) => field.key)).size,
    ).toBe(INVENTORY_DETAIL_FIELDS.length);
  });
});
