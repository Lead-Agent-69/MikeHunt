import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase client so we can drive a paginated .range() result set. The builder is chainable:
// from → select → eq → not → order → range (terminal, returns the page).
const mockRange = vi.fn();
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  not: vi.fn(() => chain),
  order: vi.fn(() => chain),
  range: mockRange,
};
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from: vi.fn(() => chain) }),
  isSupabaseConfigured: () => true,
}));

import { DealsService } from "./deals-service";

describe("DealsService.getAvailableMakes (distinct, paginated past the 1000-row cap)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pages with .range() until a short page, deduping across pages", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      make: `Make${i % 50}`, // 50 distinct, repeated
    }));
    const page2 = [{ make: "Bentley" }, { make: "Camaro" }]; // only on page 2 — would be lost under the cap
    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const makes = await new DealsService().getAvailableMakes();

    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(makes).toContain("Bentley"); // reached only by paging past 1000
    expect(makes).toContain("Camaro");
    expect(makes.filter((m) => m === "Make0")).toHaveLength(1); // deduped
    expect(makes).toEqual([...makes].sort()); // sorted
  });

  it("drops extraction junk (bare symbols, pure numbers) but keeps real makes", async () => {
    mockRange.mockResolvedValueOnce({
      data: [
        { make: "Toyota" },
        { make: "!" },
        { make: "1953" },
        { make: "F" },
        { make: "BMW" },
      ],
      error: null,
    });
    const makes = await new DealsService().getAvailableMakes();
    expect(makes).toEqual(["BMW", "Toyota"]);
  });

  it("stops at the first short page (no infinite loop)", async () => {
    mockRange.mockResolvedValueOnce({ data: [{ make: "Honda" }], error: null });
    const makes = await new DealsService().getAvailableMakes();
    expect(mockRange).toHaveBeenCalledTimes(1);
    expect(makes).toEqual(["Honda"]);
  });
});

describe("DealsService.mapDbToDeal this-binding via list mappers", () => {
  // mapDbToDeal calls this.rowOptions(row). Passing the method to Array#map without
  // binding drops `this`, which threw on /api/deals while getDealById (direct call) worked.
  const listChain: Record<string, any> = {};
  const mockFrom = vi.fn(() => listChain);

  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of [
      "select",
      "eq",
      "gte",
      "in",
      "or",
      "order",
      "limit",
      "range",
      "not",
      "single",
    ]) {
      listChain[m] = vi.fn(() => listChain);
    }
    // Terminal: awaiting the builder resolves to the page payload.
    listChain.then = (
      resolve: (v: unknown) => unknown,
      reject?: (e: unknown) => unknown,
    ) => Promise.resolve(listChain.__result).then(resolve, reject);
    mockFrom.mockReturnValue(listChain);
  });

  function serviceWithListMock() {
    const svc = new DealsService();
    (svc as any).supabase = { from: mockFrom };
    return svc;
  }

  const sampleRow = {
    id: "d1",
    source: "craigslist",
    title: "2015 Honda Civic",
    year: 2015,
    make: "Honda",
    model: "Civic",
    condition: "fair",
    ask_price: 4500,
    profit_estimate: 800,
    profit_score: 75,
    images: [],
    location_city: "Austin",
    location_state: "TX",
    active: true,
    first_seen_at: "2026-01-01T00:00:00Z",
    last_seen_at: "2026-01-02T00:00:00Z",
    source_url: "https://example.com/listing",
    options: { seller: "Bob's Yard", sellerType: "dealer" },
  };

  it("getHotDeals maps rows without losing this (rowOptions / seller)", async () => {
    listChain.__result = { data: [sampleRow], error: null };
    const deals = await serviceWithListMock().getHotDeals(5);
    expect(deals).toHaveLength(1);
    expect(deals[0].id).toBe("d1");
    expect(deals[0].seller).toBe("Bob's Yard");
    expect(deals[0].sellerType).toBe("dealer");
    expect(deals[0].askPrice).toBe(4500);
  });

  it("getDeals maps rows without losing this", async () => {
    listChain.__result = { data: [sampleRow], error: null, count: 1 };
    const { deals, total, hasMore } = await serviceWithListMock().getDeals({
      limit: 10,
    });
    expect(deals).toHaveLength(1);
    expect(deals[0].seller).toBe("Bob's Yard");
    expect(total).toBe(1);
    expect(hasMore).toBe(false);
  });

  it("preserves explicit negative operability reports without inferring them from condition", async () => {
    listChain.__result = {
      data: [
        { ...sampleRow, id: "reported", run_drive: false, keys_present: true },
        {
          ...sampleRow,
          id: "unknown",
          condition: "run_drive",
          run_drive: null,
          keys_present: null,
        },
      ],
      error: null,
      count: 2,
    };
    const { deals } = await serviceWithListMock().getDeals({ limit: 10 });
    expect(deals[0].runAndDrive).toBe(false);
    expect(deals[0].hasKeys).toBe(true);
    expect(deals[1].runAndDrive).toBeUndefined();
    expect(deals[1].hasKeys).toBeUndefined();
  });

  it("searchDeals maps rows without losing this", async () => {
    listChain.__result = { data: [sampleRow], error: null, count: 1 };
    const { deals } = await serviceWithListMock().searchDeals("Honda", {
      limit: 10,
    });
    expect(deals).toHaveLength(1);
    expect(deals[0].seller).toBe("Bob's Yard");
  });
});

describe("DealsService.mapDbToDeal last_seen", () => {
  const map = (row: Record<string, unknown>) =>
    (new DealsService() as any).mapDbToDeal({ id: "x", ...row });

  it("is null when last_seen_at is missing or bad, never a 1970 date", () => {
    for (const v of [null, undefined, "", "not a date"]) {
      expect(map({ last_seen_at: v }).lastSeenAt, String(v)).toBeNull();
    }
  });

  it("is a Date for a real timestamp", () => {
    const d = map({ last_seen_at: "2026-10-10T05:00:00Z" }).lastSeenAt;
    expect(d).toBeInstanceOf(Date);
    expect(d.toISOString()).toBe("2026-10-10T05:00:00.000Z");
  });
});
