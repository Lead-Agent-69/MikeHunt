import { describe, it, expect } from "vitest";
import { parseCopartLots } from "./copart";

// Mirrors the real Copart /public/lots/search-results payload (data.results.content), cryptic codes.
const resp = (content: any[]) => ({ data: { results: { content } } });

describe("parseCopartLots", () => {
  it("maps a salvage car lot (ld/lcy/mkn/lm/dd/la + ACV fallback price)", () => {
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
    expect(d.ask_price).toBe(17913); // no bid → ACV reference
    expect(d.condition).toBe("repairable");
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

  it("skips non-cars (ATV/equipment) and lots with no price signal", () => {
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
    expect(items).toEqual([]);
  });

  it("never throws on junk", () => {
    expect(parseCopartLots({})).toEqual([]);
    expect(parseCopartLots(null)).toEqual([]);
    expect(parseCopartLots(resp([]))).toEqual([]);
  });
});
