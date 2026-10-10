import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls = vi.hoisted(() => [] as Array<[string, ...unknown[]]>);
function query() {
  const q: any = {};
  let range = [0, 47];
  let ids: string[] | null = null;
  for (const method of [
    "select",
    "eq",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
    "or",
    "ilike",
    "order",
    "in",
    "is",
    "neq",
  ]) {
    q[method] = (...args: unknown[]) => {
      calls.push([method, ...args]);
      if (method === "in" && args[0] === "id") ids = args[1] as string[];
      return q;
    };
  }
  q.range = (from: number, to: number) => {
    range = [from, to];
    calls.push(["range", from, to]);
    return q;
  };
  q.then = (resolve: (value: unknown) => unknown) =>
    resolve({
      count: 1100,
      error: null,
      data: Array.from(
        { length: Math.max(0, Math.min(range[1] + 1, 1100) - range[0]) },
        (_, index) => ({
          id: ids?.[index] || `car-${range[0] + index}`,
          make: "Ford",
          model: "F-150",
          year: 2020,
          ask_price: 12500,
          source: "craigslist",
          location_state: "TX",
          condition: "clean_title",
          options: {},
          images: [],
        }),
      ),
    });
  return q;
}
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from: () => query() }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: () => query() }),
}));
vi.mock("@/lib/deals/deal-desk-access", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveCallerDesk: async () => "personal",
}));

import { GET as scan } from "./route";
import { GET as facets } from "./facets/route";
import { invalidate } from "@/lib/cache";

describe("Scan and facets query parity", () => {
  beforeEach(() => {
    calls.splice(0);
    invalidate("scan-category:");
  });
  it("shares unreported-value range rules between results and facet counts", async () => {
    for (const handler of [scan, facets]) {
      calls.splice(0);
      const response = await handler(
        new NextRequest(
          "https://example.test/api/scan?pricePolicy=include&maxPrice=10000&mileagePolicy=include&maxMileage=0",
        ),
      );
      expect(response.status).toBe(200);
      expect(calls).toContainEqual([
        "or",
        "ask_price.is.null,ask_price.lte.0,and(ask_price.gt.0,ask_price.lte.10000)",
      ]);
      expect(calls).toContainEqual([
        "or",
        "mileage.is.null,mileage.lt.0,and(mileage.gte.0,mileage.lte.0)",
      ]);
      expect(calls).not.toContainEqual(["gt", "ask_price", 0]);
      expect(calls).not.toContainEqual(["lte", "mileage", 0]);
    }
  });
  it("rejects unsupported policy values rather than silently ignoring them", async () => {
    for (const handler of [scan, facets]) {
      calls.splice(0);
      expect(
        (
          await handler(
            new NextRequest("https://example.test/api/scan?pricePolicy=typo"),
          )
        ).status,
      ).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("shares extended filters and enables auction inventory for auction dates", async () => {
    const search =
      "auctionFrom=2026-10-07&auctionTo=2026-10-08&minBuyNow=500&runDrive=unknown&hasPhotos=yes&zip=78701";
    for (const handler of [scan, facets]) {
      calls.splice(0);
      const response = await handler(
        new NextRequest(`https://example.test/api/scan?${search}`),
      );
      expect(response.status).toBe(200);
      expect(calls).toContainEqual(["is", "run_drive", null]);
      expect(calls).toContainEqual(["gte", "buy_now_price", 500]);
      expect(calls).toContainEqual([
        "lt",
        "auction_end_at",
        "2026-10-09T00:00:00.000Z",
      ]);
      expect(calls).toContainEqual(["neq", "images", "{}"]);
      expect(calls).toContainEqual(["eq", "location_zip", "78701"]);
      expect(
        calls.some((call) => call[0] === "not" && call[1] === "source"),
      ).toBe(false);
    }
  });
  it("uses the same category classifier in results and facets before display pagination", async () => {
    const response = await scan(
      new NextRequest(
        "https://example.test/api/scan?q=truck&states=MO,FL&page=18&pageSize=48",
      ),
    );
    const body = await response.json();
    expect(body.total).toBe(1100);
    expect(body.vehicles).toHaveLength(48);
    expect(body.vehicles[0].id).toBe("car-864");
    expect(calls).toContainEqual(["in", "location_state", ["MO", "FL"]]);
    expect(calls).toContainEqual(["range", 1000, 1999]);
    expect(
      calls.some(
        ([method, filter]) =>
          method === "or" && String(filter).includes("%truck%"),
      ),
    ).toBe(false);
    calls.splice(0);
    const facetsResponse = await facets(
      new NextRequest(
        "https://example.test/api/scan/facets?q=truck&states=MO,FL",
      ),
    );
    expect((await facetsResponse.json()).makes).toEqual([
      { make: "Ford", count: 1100 },
    ]);
    expect(calls).toContainEqual(["in", "location_state", ["MO", "FL"]]);
  });

  it("can retrieve trust-ranked inventory beyond the former 500-row ceiling", async () => {
    const response = await scan(
      new NextRequest(
        "https://example.test/api/scan?sort=score&page=18&pageSize=48",
      ),
    );
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.vehicles).toHaveLength(48);
    expect(body.vehicles[0].id).toBe("car-864");
    expect(calls).toContainEqual(["range", 864, 911]);
    expect(calls).toContainEqual(["order", "id", { ascending: true }]);
    expect(body.hasMore).toBe(true);
  });

  it("pages facets beyond PostgREST's 1000-row cap", async () => {
    const response = await facets(
      new NextRequest("https://example.test/api/scan/facets?state=TX"),
    );
    const body = await response.json();
    expect(body.makes).toEqual([{ make: "Ford", count: 1100 }]);
    expect(calls).toContainEqual(["range", 0, 999]);
    expect(calls).toContainEqual(["range", 1000, 1999]);
  });

  it("applies matching details, ranges and auction exclusion to both endpoints", async () => {
    const search =
      "state=TX&lane=private&minMileage=5000&maxMileage=88000&fuelType=Hybrid&damage=front&body=SUV";
    for (const handler of [scan, facets]) {
      calls.splice(0);
      await handler(new NextRequest(`https://example.test/api/scan?${search}`));
      expect(calls).toContainEqual(["gte", "mileage", 5000]);
      expect(calls).toContainEqual(["lte", "mileage", 88000]);
      expect(calls).toContainEqual([
        "or",
        "fuel_type.ilike.%Hybrid%,options->>fuelType.eq.Hybrid",
      ]);
      expect(calls).toContainEqual(["ilike", "damage_type", "%front%"]);
      expect(
        calls.some(
          ([method, column]) => method === "not" && column === "source",
        ),
      ).toBe(true);
    }
  });

  it("rejects inverted ranges before querying inventory", async () => {
    for (const handler of [scan, facets]) {
      calls.splice(0);
      const response = await handler(
        new NextRequest(
          "https://example.test/api/scan?minPrice=20000&maxPrice=10000",
        ),
      );
      expect(response.status).toBe(400);
      expect(calls).toEqual([]);
    }
  });
  it("buy-now inventory includes eligible auctions and unknown keys are not treated as absent", async () => {
    for (const handler of [scan, facets]) {
      calls.splice(0);
      await handler(
        new NextRequest(
          "https://example.test/api/scan?keys=unknown&buyNow=1&maxMileage=0",
        ),
      );
      expect(calls).toContainEqual(["is", "keys_present", null]);
      expect(calls).toContainEqual(["gt", "buy_now_price", 0]);
      expect(calls).toContainEqual(["lte", "mileage", 0]);
      expect(
        calls.some(
          ([method, column]) => method === "not" && column === "source",
        ),
      ).toBe(false);
    }
  });

  it("filters titleType (comma-multi) on the condition enum in scan and the facets cascade", async () => {
    for (const handler of [
      scan,
      (r: NextRequest) => facets(new NextRequest(`${r.url}&make=Ford`)),
    ]) {
      calls.splice(0);
      await handler(
        new NextRequest(
          "https://example.test/api/scan?titleType=salvage,unknown",
        ),
      );
      expect(calls).toContainEqual([
        "or",
        "condition.in.(run_drive,parts_only,salvage_title,flood,fire,hail),condition.is.null",
      ]);
      expect(calls.some(([m, c]) => m === "eq" && c === "condition")).toBe(
        false,
      );
    }
    calls.splice(0);
    const body = await (
      await scan(
        new NextRequest("https://example.test/api/scan?titleType=clean"),
      )
    ).json();
    expect(calls).toContainEqual(["or", "condition.in.(clean_title)"]);
    expect(body.vehicles[0].titleCategory).toBe("clean");
  });

  it.each([
    ["clean", "condition.in.(clean_title)"],
    ["rebuilt", "condition.in.(rebuilt_title)"],
    ["salvage", "condition.in.(parts_only,salvage_title)"],
    ["rebuildable", "condition.in.(repairable)"],
    ["unknown", "condition.in.(run_drive,flood,fire,hail),condition.is.null"],
    ["rebuilt,rebuildable", "condition.in.(repairable,rebuilt_title)"],
  ])(
    "scan titleType=%s filters the condition enum",
    async (titleType, expected) => {
      calls.splice(0);
      await scan(
        new NextRequest(`https://example.test/api/scan?titleType=${titleType}`),
      );
      expect(calls).toContainEqual(["or", expected]);
      expect(calls.some(([m, c]) => m === "eq" && c === "condition")).toBe(
        false,
      );
    },
  );

  it("facets count title buckets without the selected titleType, other facets keep it", async () => {
    calls.splice(0);
    const body = await (
      await facets(
        new NextRequest(
          "https://example.test/api/scan/facets?titleType=salvage&state=TX",
        ),
      )
    ).json();
    // The mock inventory is all clean_title: the clean bucket still counts them...
    expect(body.titleTypes.find((b: any) => b.value === "clean").count).toBe(
      1100,
    );
    // ...while the salvage-filtered makes facet is empty, and no DB title filter ran.
    expect(body.makes).toEqual([]);
    expect(
      calls.some(([m, f]) => m === "or" && String(f).startsWith("condition")),
    ).toBe(false);
    expect(calls).toContainEqual(["eq", "location_state", "TX"]);
  });

  it("scan rows expose options.titleSource only", async () => {
    const body = await (
      await scan(new NextRequest("https://example.test/api/scan?state=TX"))
    ).json();
    expect(body.vehicles[0]).toHaveProperty("titleSource", null);
    expect(body.vehicles[0]).not.toHaveProperty("options");
  });
});
