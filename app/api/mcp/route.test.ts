import { beforeEach, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
const state = vi.hoisted(() => ({
  owner: "owner-a",
  revoked: false,
  identityError: false,
  deals: [] as any[],
  dealsError: false,
  mode: "reseller" as string | undefined,
  calls: [] as any[],
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (table: string) => {
      const q: any = {};
      for (const method of [
        "select",
        "eq",
        "or",
        "ilike",
        "gte",
        "lte",
        "not",
        "neq",
        "order",
        "limit",
        "maybeSingle",
        "abortSignal",
        "update",
      ]) {
        q[method] = (...args: any[]) => {
          state.calls.push([table, method, ...args]);
          return q;
        };
      }
      q.then = (resolve: any) =>
        Promise.resolve(
          table === "api_keys"
            ? {
                data: {
                  id: "key-a",
                  user_id: state.owner,
                  revoked: state.revoked,
                  request_count: 0,
                },
                error: state.identityError ? {} : null,
              }
            : table === "user_preferences"
              ? {
                  data: { prefs: { buyerScope: { buyerMode: state.mode } } },
                  error: null,
                }
              : {
                  data: state.deals,
                  error: state.dealsError ? {} : null,
                  count: state.deals.length,
                },
        ).then(resolve);
      return q;
    },
  }),
}));
import { POST } from "./route";
beforeEach(() => {
  Object.assign(state, {
    owner: "owner-a",
    revoked: false,
    identityError: false,
    deals: [],
    dealsError: false,
    mode: "reseller",
    calls: [],
  });
});
async function call(name: string, args: any = {}, key = "test-only-key") {
  const res = await POST(
    new NextRequest("https://dealerhunt.vercel.app/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name, arguments: args },
      }),
    }),
  );
  return res.json();
}
it("withholds the legacy GO, profit and 92% bid when evidence is missing", async () => {
  state.deals = [{ ...briefCandidate(), deal_analysis: {} }];
  const r = await call("get_next_best_buy", { capital: 20000 });
  expect(r.result.content[0].text).toContain("No verified buy candidate");
  expect(r.result.content[0].text).not.toContain("9,200");
  expect(r.result.content[0].text).not.toContain("NEXT BEST BUY");
});
it("binds preferences to key ownership, not a browser account", async () => {
  state.deals = [briefCandidate()];
  await call("search_deals", { verdict: "all" });
  expect(state.calls).toContainEqual([
    "user_preferences",
    "eq",
    "user_id",
    "owner-a",
  ]);
  expect(state.calls).toContainEqual(["api_keys", "eq", "user_id", "owner-a"]);
  expect(state.calls).toContainEqual(["api_keys", "eq", "request_count", 0]);
  state.mode = "personal";
  const r = await call("search_deals", { verdict: "all" });
  expect(r.result.content[0].text).not.toContain("maximum bid:");
});
it("revoked, missing-owner and failed key lookups never read inventory", async () => {
  for (const patch of [
    { revoked: true },
    { owner: "" },
    { identityError: true },
  ]) {
    Object.assign(
      state,
      { revoked: false, owner: "owner-a", identityError: false, calls: [] },
      patch,
    );
    const r = await call("market_pulse");
    expect(r.result.isError).toBe(true);
    expect(state.calls.some((c) => c[0] === "deals")).toBe(false);
  }
});
it("reports service errors without raw backend messages or false empty results", async () => {
  state.dealsError = true;
  const r = await call("market_pulse");
  expect(r.result.isError).toBe(true);
  expect(r.result.content[0].text).toContain("temporarily unavailable");
});
it("returns verified candidates with source, observation and canonical link", async () => {
  state.deals = [briefCandidate()];
  const r = await call("get_next_best_buy", { capital: 10000 });
  expect(r.result.content[0].text).toContain("Evidence-backed candidate");
  expect(r.result.content[0].text).toContain(
    "https://dealerhunt.vercel.app/deal/",
  );
  expect(r.result.content[0].text).toContain("Observed:");
});
it("does not invent turnover and rejects wildcard searches", async () => {
  expect(
    (await call("get_next_best_buy", { strategy: "fastest_flip" })).result
      .content[0].text,
  ).toContain("not established");
  expect((await call("search_deals", { model: "Model%" })).error.code).toBe(
    -32602,
  );
});
