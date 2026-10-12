import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const state = vi.hoisted(() => ({
  rows: [] as any[],
  flip: false,
  owner: "one" as string | null,
  columns: "",
  filters: [] as any[],
  orders: [] as any[],
  limit: 0,
}));
const from = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ from }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: state.owner ? { id: state.owner } : null },
  }),
}));
vi.mock("@/lib/reco/signals", () => ({ recordDealSignal: vi.fn() }));
vi.mock("@/lib/deals/deal-desk-access", () => ({
  resolveCallerFlipDesk: async () => state.flip,
}));
import { GET } from "./route";
const uuid = (n: number) =>
  `00000000-0000-0000-0000-${n.toString().padStart(12, "0")}`;
const req = (cursor?: string, view = "page", owner = "one") =>
  new NextRequest(
    `http://localhost/api/saved-cars?${new URLSearchParams({ view, filter: "all", ...(cursor ? { cursor } : {}) })}`,
    { headers: { "X-Save-Owner": owner } },
  );
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(state, {
    flip: false,
    owner: "one",
    filters: [],
    orders: [],
    limit: 0,
  });
  state.rows = Array.from({ length: 603 }, (_, n) => ({
    id: uuid(603 - n),
    user_id: "one",
    saved_at: "2026-10-12T00:00:00.123456+00:00",
    status: "watching",
    snapshot: {
      make: "Honda",
      model: "Civic",
      estimatedProfit: 3000,
      sellerPhone: "private",
    },
  }));
  from.mockImplementation(() => {
    let rows = state.rows;
    const query: any = {
      select: (columns: string) => {
        state.columns = columns;
        return query;
      },
      eq: (key: string, value: string) => {
        state.filters.push([key, value]);
        rows = rows.filter((row) => row[key] === value);
        return query;
      },
      in: () => query,
      or: (filter: string) => {
        state.filters.push(["or", filter]);
        const id = filter.match(/id.lt.([0-9a-f-]+)/)![1];
        rows = rows.filter((row) => row.id < id);
        return query;
      },
      is: (key: string, value: unknown) => {
        state.filters.push([key, value]);
        rows = rows.filter((row) => row[key] === value);
        return query;
      },
      lt: (key: string, value: string) => {
        state.filters.push([key, value]);
        rows = rows.filter((row) => row[key] < value);
        return query;
      },
      order: (key: string, options: unknown) => {
        state.orders.push([key, options]);
        return query;
      },
      limit: async (limit: number) => {
        state.limit = limit;
        return { data: rows.slice(0, limit), error: null };
      },
    };
    return query;
  });
});
describe("owned saved collection paging", () => {
  it("walks more than 500 tied-date records without omissions or duplicates", async () => {
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 13; page++) {
      const response = await GET(req(cursor));
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ownerId).toBe("one");
      expect(body.rows.length).toBeLessThanOrEqual(50);
      expect(state.limit).toBe(51);
      for (const row of body.rows) {
        expect(seen.has(row.id)).toBe(false);
        seen.add(row.id);
        expect(row.snapshot).not.toHaveProperty("sellerPhone");
        expect(row.snapshot).not.toHaveProperty("estimatedProfit");
      }
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    expect(seen.size).toBe(603);
    expect(state.filters).toContainEqual(["user_id", "one"]);
    expect(state.orders).toContainEqual(["id", { ascending: false }]);
  });
  it("uses a slim owned envelope for checklist pages", async () => {
    const body = await (await GET(req(undefined, "checklist-page"))).json();
    expect(state.columns).not.toBe("*");
    expect(body.rows[0].snapshot).toEqual({ make: "Honda", model: "Civic" });
    expect(body.ownerId).toBe("one");
  });
  it("preserves flip-desk snapshots", async () => {
    state.flip = true;
    const body = await (await GET(req())).json();
    expect(body.rows[0].snapshot.estimatedProfit).toBe(3000);
  });
  it("continues through legacy null timestamps", async () => {
    state.rows.forEach((row) => (row.saved_at = null));
    const body = await (
      await GET(req(JSON.stringify({ id: uuid(5), savedAt: null })))
    ).json();
    expect(body.rows.map((row: any) => row.id)).toEqual([
      uuid(4),
      uuid(3),
      uuid(2),
      uuid(1),
    ]);
  });
  it("rejects injected cursors and changed sessions before querying", async () => {
    expect((await GET(req("bad"))).status).toBe(400);
    expect((await GET(req(undefined, "page", "previous"))).status).toBe(409);
    expect(from).not.toHaveBeenCalled();
  });
});
