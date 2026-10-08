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
});
