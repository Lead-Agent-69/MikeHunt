// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  user: { id: "u1" } as any,
  update: null as any,
  filters: [] as any[],
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: () => {
      const q: any = {
        update: (u: any) => {
          state.update = u;
          return q;
        },
        eq: (k: string, v: any) => {
          state.filters.push([k, v]);
          return q;
        },
        select: () => q,
        maybeSingle: async () => ({
          data: { id: "a1", feedback: state.update?.feedback ?? null },
          error: null,
        }),
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: state.user } }),
}));

import { PATCH } from "./route";

const call = (body: any) =>
  PATCH(
    new NextRequest("https://x/api/alerts/a1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "a1" }) },
  );

beforeEach(() => {
  state.user = { id: "u1" };
  state.update = null;
  state.filters = [];
});

describe("PATCH /api/alerts/[id] feedback", () => {
  it("saves a thumbs rating scoped to the caller", async () => {
    const res = await call({ feedback: -1 });
    expect(res.status).toBe(200);
    expect(state.update.feedback).toBe(-1);
    expect(state.filters).toContainEqual(["user_id", "u1"]);
  });
  it("0 clears the rating", async () => {
    await call({ feedback: 0 });
    expect(state.update).toEqual({ feedback: null, feedback_at: null });
  });
  it("rejects other values and signed-out callers", async () => {
    expect((await call({ feedback: 5 })).status).toBe(400);
    state.user = null;
    expect((await call({ feedback: 1 })).status).toBe(401);
  });
});
