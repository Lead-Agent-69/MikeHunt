import { describe, it, expect, vi, afterEach } from "vitest";
import { parseCopartLots, previewCopartLots, scrapeCopart } from "./copart";
import { upsertDeals } from "../pipeline";
vi.mock("../pipeline", () => ({ upsertDeals: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

// Mirrors the real Copart /public/lots/search-results payload (data.results.content), cryptic codes.
const resp = (content: any[]) => ({ data: { results: { content } } });

describe("parseCopartLots", () => {
  it("reports source failures instead of successful empty inventory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 403 }),
    );
    await expect(previewCopartLots()).rejects.toThrow("HTTP 403");
    await expect(scrapeCopart(1)).rejects.toThrow("HTTP 403");
  });
  it("returns accepted rows rather than attempted rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => resp([{ ln: 1, mkn: "FORD", lm: "F-150", hb: 3000 }]),
      }),
    );
    vi.mocked(upsertDeals).mockResolvedValueOnce(0);
    await expect(scrapeCopart(1)).resolves.toBe(0);
  });
  it("retains pre-loss value as reference, never as acquisition price", () => {
    const items = parseCopartLots(
      resp([
        {
          ln: 26503690,
          ld: "2016 CHEVROLET VOLT LTZ",
          lcy: 2016,
          mkn: "CHEVROLET",
          lm: "VOLT",
          dd: "FRONT END",
          csc: "UNKNOWN",
          fv: "1G1RD6S52GU******",
          la: 17913.0,
          hb: 0.0,
          lbd: 0.0,
          ldu: "2016-chevrolet-volt-ltz",
          locState: "CA",
          locCity: "SAN DIEGO",
          memberVehicleType: "SEDAN",
          dynamicLotDetails: { currentBid: 0 },
        },
      ]),
    );
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("copart");
    expect(d.source_deal_id).toBe("26503690");
    expect(d.year).toBe(2016);
    expect(d.make).toBe("Chevrolet");
    expect(d.model).toBe("Volt");
    expect(d.ask_price).toBe(0);
    expect(d.condition).toBeUndefined();
    expect(d.seller_type).toBe("auction");
    expect(d.options?.priceEvidence).toEqual({
      kind: "reference",
      currentBid: undefined,
      buyNow: undefined,
      referenceValue: 17913,
    });
    expect(d.location_state).toBe("CA");
    expect(d.location_city).toBe("San Diego");
    expect(d.metadata?.price_is_acv_estimate).toBe(true);
    expect(d.source_url).toBe(
      "https://www.copart.com/lot/26503690/2016-chevrolet-volt-ltz",
    );
  });

  it("prefers a live bid over ACV and maps damage→condition", () => {
    const items = parseCopartLots(
      resp([
        {
          ln: 1,
          ld: "2018 FORD F-150",
          lcy: 2018,
          mkn: "FORD",
          lm: "F-150",
          dd: "WATER/FLOOD",
          la: 20000,
          hb: 8500,
          dynamicLotDetails: { currentBid: 8500 },
          memberVehicleType: "PICKUP",
        },
      ]),
    );
    expect(items[0].ask_price).toBe(8500); // bid wins
    expect(items[0].condition).toBe("flood");
    expect(items[0].metadata?.price_is_acv_estimate).toBe(false);
  });

  it("skips non-cars but retains unpriced car lots without invented economics", () => {
    const items = parseCopartLots(
      resp([
        {
          ln: 2,
          ld: "2009 ARCTIC CAT",
          mkn: "ARCTIC CAT",
          la: 6300,
          memberVehicleType: "INDUSTRIAL EQUIPMENT",
        },
        {
          ln: 3,
          ld: "2010 HONDA CIVIC",
          mkn: "HONDA",
          lm: "CIVIC",
          la: -1,
          hb: 0,
          memberVehicleType: "SEDAN",
        },
      ]),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      ask_price: 0,
      options: { priceEvidence: { kind: "unknown" } },
    });
  });

  it("keeps current bid and buy-now separate without claiming minor damage proves operability", () => {
    const [row] = parseCopartLots(
      resp([
        {
          ln: 4,
          mkn: "FORD",
          lm: "F-150",
          hb: 3000,
          lbd: 25000,
          la: 27000,
          dd: "MINOR DENT/SCRATCHES",
          dynamicLotDetails: { currentBid: 3500, buyTodayBid: 14000 },
        },
      ]),
    );
    expect(row.ask_price).toBe(3500);
    expect(row.buy_now_price).toBe(14000);
    expect(row.options?.priceEvidence).toMatchObject({
      kind: "current_bid",
      currentBid: 3500,
      buyNow: 14000,
      referenceValue: 27000,
    });
    expect(row.condition).toBeUndefined();
  });

  it("uses only a reported buy-now amount when no valid bid is available", () => {
    const [row] = parseCopartLots(
      resp([
        {
          ln: 5,
          mkn: "HONDA",
          lm: "CIVIC",
          hb: -5,
          lbd: 12000,
          dynamicLotDetails: { currentBid: Infinity, buyTodayBid: 6000 },
          dd: "VANDALISM",
        },
      ]),
    );
    expect(row.ask_price).toBe(6000);
    expect(row.options?.priceEvidence.kind).toBe("buy_now");
    expect(row.condition).toBeUndefined();
  });

  it("never throws on junk", () => {
    expect(parseCopartLots({})).toEqual([]);
    expect(parseCopartLots(null)).toEqual([]);
    expect(parseCopartLots(resp([]))).toEqual([]);
  });
});

import { copartOdometer, copartZip } from "./copart";

describe("Copart odometer / trim / zip (public lots JSON, sample 2026-10-10)", () => {
  it("reads orr as mileage unless the reading is not actual or exempt", () => {
    expect(copartOdometer({ orr: 74308.0, ord: null })).toBe(74308);
    expect(copartOdometer({ orr: 0 })).toBeUndefined();
    expect(copartOdometer({ orr: 120000, ord: "NOT ACTUAL" })).toBeUndefined();
    expect(copartOdometer({ orr: 120000, ord: "EXEMPT" })).toBeUndefined();
    expect(copartOdometer({})).toBeUndefined();
  });
  it("keeps the 5-digit zip", () => {
    expect(copartZip("33578 7610")).toBe("33578");
    expect(copartZip(undefined)).toBeUndefined();
  });
  it("maps orr, ltd and zip on a parsed lot", () => {
    const [row] = parseCopartLots({
      data: {
        results: {
          content: [
            {
              ln: 25875430,
              lcy: 2017,
              mkn: "NISSAN",
              lm: "SENTRA",
              ltd: "S",
              orr: 74308.0,
              zip: "33578 7610",
              la: 11125,
              memberVehicleType: "AUTOMOBILE",
              dd: "FRONT END",
              locState: "FL",
              locCity: "RIVERVIEW",
            },
          ],
        },
      },
    });
    expect(row).toMatchObject({
      mileage: 74308,
      trim: "S",
      location_zip: "33578",
    });
  });
});
