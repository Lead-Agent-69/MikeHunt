import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls = vi.hoisted(() => [] as Array<[string, ...unknown[]]>);
const rows = vi.hoisted(() => ({ value: [] as any[] }));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => {
      const q: any = {};
      for (const m of [
        "select",
        "eq",
        "or",
        "gt",
        "gte",
        "lt",
        "lte",
        "order",
        "range",
        "in",
        "not",
        "ilike",
        "is",
      ])
        q[m] = (...args: unknown[]) => {
          calls.push([m, ...args]);
          return q;
        };
      return q;
    },
  }),
}));
vi.mock("@/lib/db/paginate", () => ({
  fetchAllRows: async (page: (from: number, to: number) => unknown) => {
    page(0, 999);
    return rows.value;
  },
}));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => false,
}));

import { GET } from "./route";

const req = (qs: string, ip: string) =>
  new NextRequest(`http://localhost/api/deals/map${qs}`, {
    headers: { "x-forwarded-for": ip },
  });

describe("GET /api/deals/map titleType", () => {
  it("filters on condition, selects condition + damage_type, returns titleCategory", async () => {
    calls.splice(0);
    rows.value = [
      {
        id: "a",
        year: 2019,
        make: "Ford",
        model: "F-150",
        ask_price: 9000,
        true_net_profit: 3000,
        deal_verdict: "go",
        lat: 38.6,
        lng: -90.2,
        location_state: "MO",
        condition: "parts_only",
        damage_type: "Front End",
        title_source: "source_default",
      },
    ];
    const body = await (
      await GET(req("?titleType=salvage,rebuildable", "10.9.0.1"))
    ).json();
    const select = calls.find(([m]) => m === "select")?.[1] as string;
    expect(select).toMatch(/\bcondition\b/);
    expect(select).toMatch(/\bdamage_type\b/);
    expect(calls).toContainEqual([
      "or",
      "condition.in.(repairable,parts_only,salvage_title)",
    ]);
    expect(body.points[0]).toMatchObject({
      condition: "parts_only",
      damageType: "Front End",
      titleCategory: "salvage",
      titleSource: "source_default",
    });
    expect(select).toContain("title_source:options->>titleSource");
    expect(select).not.toMatch(/(^|,\s*)options(\s*,|$)/);
    // Personal desk: still no profit in the payload.
    expect(JSON.stringify(body)).not.toContain("3000");
  });

  it("no titleType → no condition filter", async () => {
    calls.splice(0);
    rows.value = [];
    await GET(req("", "10.9.0.2"));
    expect(
      calls.some(([m, f]) => m === "or" && String(f).startsWith("condition")),
    ).toBe(false);
  });
});
