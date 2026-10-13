import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ calls: [] as unknown[][], fail: false }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/cache", () => ({
  cached: (_key: string, _ttl: number, run: () => unknown) => run(),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => {
      const q: any = {};
      for (const method of [
        "select",
        "eq",
        "not",
        "neq",
        "gte",
        "lte",
        "or",
        "order",
      ])
        q[method] = (...args: unknown[]) => {
          state.calls.push([method, ...args]);
          return q;
        };
      q.range = () =>
        Promise.resolve({
          data: [
            { location_state: "MO" },
            { location_state: "MO" },
            { location_state: "IL" },
          ],
          error: state.fail ? new Error("private database error") : null,
        });
      return q;
    },
  }),
}));
import { GET } from "./route";
beforeEach(() => {
  state.calls = [];
  state.fail = false;
});
describe("state picker inventory counts", () => {
  it("counts photo-backed recent records, not the unqualified stored-row RPC", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/state-counts"),
    );
    expect(await response.json()).toMatchObject({ counts: { MO: 2, IL: 1 } });
    expect(state.calls).toContainEqual(["neq", "images", "{}"]);
    expect(
      state.calls.some(
        (call) => call[0] === "gte" && call[1] === "last_seen_at",
      ),
    ).toBe(true);
  });
  it("reports failure rather than presenting a failed query as zero inventory", async () => {
    state.fail = true;
    const response = await GET(
      new NextRequest("http://localhost/api/state-counts"),
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain(
      "private database error",
    );
  });
});
