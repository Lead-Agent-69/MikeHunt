import { describe, it, expect, beforeEach } from "vitest";
import {
  DEMO_KEY,
  fetchGsaApiVehicles,
  gsaApiKey,
  gsaApiLotToDeal,
  gsaMinIntervalMs,
  parseGsaApi,
  resetGsaApiThrottle,
} from "./gsa-official";

const lot = (over: Record<string, unknown> = {}) => ({
  saleNo: "4-1-QSC-I-27-009",
  lotNo: "010",
  aucEndDt: "2026-10-15",
  itemName: "2020 RAM 2500",
  propertyCity: "Phoenix",
  propertyState: "AZ",
  propertyZip: "85001",
  auctionStatus: "Active",
  highBidAmount: 14609,
  biddersCount: 7,
  agencyName: "DHS, Customs and Border Protection",
  itemDescURL: "https://www.gsaauctions.gov/auctions/preview/378837",
  imageURL: "https://www.ppms.gov/gw/auction/ppms/api/v1/auction/image/x.jpg",
  ...over,
});

describe("gsa official API adapter", () => {
  beforeEach(() => resetGsaApiThrottle());

  it("uses GSA_API_KEY when set, else DEMO_KEY with a slower throttle", () => {
    expect(gsaApiKey({ GSA_API_KEY: "abc" })).toEqual({
      key: "abc",
      demo: false,
    });
    expect(gsaApiKey({})).toEqual({ key: DEMO_KEY, demo: true });
    expect(gsaMinIntervalMs(true)).toBeGreaterThan(gsaMinIntervalMs(false));
  });

  it("maps a vehicle lot", () => {
    const d = gsaApiLotToDeal(lot())!;
    expect(d).toMatchObject({
      source: "gov_auction",
      source_deal_id: "gsa-api-378837",
      year: 2020,
      make: "Ram",
      model: "2500",
      ask_price: 14609,
      location_state: "AZ",
      bid_count: 7,
    });
  });

  it("drops aircraft, boats, equipment and lots without a year", () => {
    for (const itemName of [
      "1983 Cessna U206G, SN: U20606754",
      "2006 Boston Whaler Guardian 19' monohull Vessel",
      "2000 John Deere 6410 Tractor w/640 Loader",
      "1980 UNIVERSAL COUNTER",
      "Ford F-150 parts lot",
    ])
      expect(gsaApiLotToDeal(lot({ itemName }))).toBeNull();
  });

  it("no bid yet → price 0 (never invented)", () => {
    expect(gsaApiLotToDeal(lot({ highBidAmount: null }))!.ask_price).toBe(0);
  });

  it("parses the Results wrapper and dedupes", () => {
    expect(
      parseGsaApi({
        Results: [lot(), lot(), lot({ itemDescURL: "https://x/preview/1" })],
      }),
    ).toHaveLength(2);
  });

  it("sends the key as a header, follows the redirect without it, and throttles", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        headers: (init?.headers || {}) as Record<string, string>,
      });
      if (url.startsWith("https://api.gsa.gov"))
        return new Response(null, {
          status: 303,
          headers: { location: "https://files.example/active.json?sig=1" },
        });
      return new Response(JSON.stringify({ Results: [lot()] }), {
        status: 200,
      });
    };
    const env = { GSA_API_KEY: "secret-key" };
    const r1 = await fetchGsaApiVehicles(env, 1_000, fetchImpl);
    expect(r1.deals).toHaveLength(1);
    expect(calls[0].url).not.toContain("secret-key");
    expect(calls[0].headers["X-Api-Key"]).toBe("secret-key");
    expect(calls[1].headers["X-Api-Key"]).toBeUndefined();
    expect(calls[0].headers["User-Agent"]).toMatch(/MikeHuntBot/i);
    const r2 = await fetchGsaApiVehicles(env, 2_000, fetchImpl);
    expect(r2.throttled).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it("backs off on 429", async () => {
    const fetchImpl = async () =>
      new Response(null, { status: 429, headers: { "retry-after": "3600" } });
    const r = await fetchGsaApiVehicles({}, 0, fetchImpl);
    expect(r.skipped).toBe("rate_limited");
    expect((await fetchGsaApiVehicles({}, 60_000, fetchImpl)).throttled).toBe(
      true,
    );
  });
});
