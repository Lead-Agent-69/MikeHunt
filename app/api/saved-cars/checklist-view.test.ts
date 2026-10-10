import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const calls: { select: string[]; limit: number[] } = { select: [], limit: [] };
let failFirstSelect = false;

function chain(columns: string) {
  calls.select.push(columns);
  const failing = failFirstSelect && calls.select.length === 1;
  const rows =
    columns === "*"
      ? [
          {
            id: "s1",
            deal_id: "d1",
            status: "active",
            tags: ["purchase-stage:Inspecting"],
            saved_at: "2026-10-09T00:00:00Z",
            snapshot: {
              year: 2018,
              make: "Ford",
              model: "F-150",
              images: ["x"],
            },
          },
        ]
      : [
          {
            id: "s1",
            deal_id: "d1",
            status: "active",
            tags: ["purchase-stage:Inspecting"],
            saved_at: "2026-10-09T00:00:00Z",
            snapshot_year: 2018,
            snapshot_make: "Ford",
            snapshot_model: "F-150",
          },
        ];
  const q: any = {
    eq: () => q,
    in: () => q,
    order: () => q,
    limit: (n: number) => {
      calls.limit.push(n);
      return Promise.resolve(
        failing
          ? { data: null, error: { message: "bad select" } }
          : { data: rows, error: null },
      );
    },
  };
  return q;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => ({ select: (columns: string) => chain(columns) }),
  }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: { id: "u1" } } }),
}));
vi.mock("@/lib/reco/signals", () => ({ recordDealSignal: vi.fn() }));
// The read-time desk gate looks up saved prefs; keep this test about the saved_cars projection.
vi.mock("@/lib/deals/deal-desk-access", async (orig) => ({
  ...(await orig<typeof import("@/lib/deals/deal-desk-access")>()),
  resolveCallerFlipDesk: async () => true,
}));

import { GET } from "./route";
import {
  CHECKLIST_SELECT,
  SAVED_CARS_LIMIT,
} from "@/lib/saved/purchase-checklist";

const req = (qs: string) =>
  new NextRequest(`https://mikehunt.test/api/saved-cars?${qs}`);

describe("GET /api/saved-cars", () => {
  beforeEach(() => {
    calls.select = [];
    calls.limit = [];
    failFirstSelect = false;
  });

  it("view=checklist uses the slim projection (no snapshot JSON) and a row limit", async () => {
    const res = await GET(req("filter=all&view=checklist"));
    const body = await res.json();
    expect(calls.select).toEqual([CHECKLIST_SELECT]);
    expect(CHECKLIST_SELECT).not.toMatch(/(^|,)snapshot(,|$)/);
    expect(calls.limit).toEqual([SAVED_CARS_LIMIT]);
    expect(body).toEqual([
      {
        id: "s1",
        deal_id: "d1",
        status: "active",
        tags: ["purchase-stage:Inspecting"],
        saved_at: "2026-10-09T00:00:00Z",
        snapshot: { year: 2018, make: "Ford", model: "F-150" },
      },
    ]);
  });

  it("falls back to full rows if the projection errors, same response shape", async () => {
    failFirstSelect = true;
    const res = await GET(req("filter=all&view=checklist"));
    const body = await res.json();
    expect(calls.select).toEqual([CHECKLIST_SELECT, "*"]);
    expect(body[0].snapshot).toEqual({
      year: 2018,
      make: "Ford",
      model: "F-150",
    });
  });

  it("default view keeps full rows but is bounded", async () => {
    await GET(req("filter=all"));
    expect(calls.select).toEqual(["*"]);
    expect(calls.limit).toEqual([SAVED_CARS_LIMIT]);
  });
});
