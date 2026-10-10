import { beforeEach, describe, expect, it, vi } from "vitest";

const updates: { id: number; patch: any; flagsNullGuard: boolean }[] = [];
let rows: any[] = [];
let selectCols = "";
let hasFlagsColumn = true;

vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: async () => true,
}));
vi.mock("@/lib/scoring/market-value", () => ({
  loadMarketIndex: async () => undefined,
}));
vi.mock("@/lib/data-quality/optional-columns", () => ({
  columnsExist: async () => hasFlagsColumn,
}));
vi.mock("@/lib/scoring/deal-analyzer", () => ({
  analyzeDeal: () => ({
    sellEstimate: 12000,
    mmrValue: 0,
    recommendedMaxBid: 9000,
    profit: 2500,
    repairCost: 0,
    transportCost: 300,
    score: 80,
    verdict: "go",
  }),
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: (cols: string) => {
        selectCols = cols;
        const chain: any = {
          eq: () => chain,
          order: () => chain,
          range: async () => ({ data: rows, error: null }),
        };
        return chain;
      },
      update: (patch: any) => {
        const rec = { id: -1, patch, flagsNullGuard: false };
        const chain: any = {
          eq: (_c: string, id: number) => {
            rec.id = id;
            return chain;
          },
          is: (c: string, v: unknown) => {
            if (c === "quality_flags" && v === null) rec.flagsNullGuard = true;
            return chain;
          },
          then: (res: any) => {
            updates.push(rec);
            return Promise.resolve({ error: null }).then(res);
          },
        };
        return chain;
      },
    }),
  }),
}));

import { POST } from "./route";

const base = {
  year: 2016,
  make: "Honda",
  model: "Civic",
  mileage: 90000,
  ask_price: 8000,
  source: "craigslist",
  vin: null,
  auction_end_at: null,
};

beforeEach(() => {
  updates.length = 0;
  hasFlagsColumn = true;
});

describe("POST /api/admin/rescore — flagged rows (Ren #306 P2)", () => {
  it("never rescores a row with stored quality_flags, and guards the write on quality_flags IS NULL", async () => {
    rows = [
      { id: 1, ...base, quality_flags: null },
      { id: 2, ...base, quality_flags: ["vin_check_digit"] },
    ];
    const res = await POST(new Request("http://x/api/admin/rescore", { method: "POST", body: "{}" }));
    const json = await res.json();
    expect(selectCols).toContain("quality_flags");
    expect(json.skippedFlagged).toBe(1);
    expect(updates.map((u) => u.id)).toEqual([1]);
    expect(updates[0].flagsNullGuard).toBe(true);
  });

  it("before the column is applied, skips rows the pure sanity check flags", async () => {
    hasFlagsColumn = false;
    rows = [
      { id: 3, ...base },
      { id: 4, ...base, mileage: 900000 },
    ];
    const res = await POST(new Request("http://x/api/admin/rescore", { method: "POST", body: "{}" }));
    const json = await res.json();
    expect(selectCols).not.toContain("quality_flags");
    expect(json.skippedFlagged).toBe(1);
    expect(updates.map((u) => u.id)).toEqual([3]);
    expect(updates[0].flagsNullGuard).toBe(false);
  });
});
