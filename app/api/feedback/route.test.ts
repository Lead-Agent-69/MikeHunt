// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  user: { id: "owner" } as { id: string } | null,
  allowed: true,
  error: null as any,
  existing: null as any,
  inserted: null as any,
  authError: null as any,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: mocks.allowed }),
  tooManyRequests: () =>
    Response.json({ error: "Rate limited" }, { status: 429 }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: mocks.user },
        error: mocks.authError,
      }),
    },
    from: () => {
      let inserted = false;
      const result = async () =>
        inserted
          ? {
              data: mocks.error ? null : { id: mocks.inserted.id },
              error: mocks.error,
            }
          : { data: mocks.existing, error: null };
      const q: any = {
        insert: (row: any) => {
          mocks.inserted = row;
          inserted = true;
          return q;
        },
        select: () => q,
        eq: () => q,
        single: result,
        maybeSingle: result,
        abortSignal: () => q,
      };
      return q;
    },
  }),
}));
import { POST } from "./route";
const body = {
  id: "11111111-1111-4111-8111-111111111111",
  listing_id: "22222222-2222-4222-8222-222222222222",
  category: "price",
  comment: "Seller asking price is different.",
};
const post = (payload: unknown = body, headers: Record<string, string> = {}) =>
  POST(
    new NextRequest("https://app.test/api/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    }),
  );
beforeEach(() => {
  mocks.authError = null;
  mocks.user = { id: "owner" };
  mocks.allowed = true;
  mocks.error = null;
  mocks.existing = null;
  mocks.inserted = null;
});
describe("listing feedback", () => {
  it("uses the public Host for same-origin requests, not the internal bind address", async () => {
    const response = await POST(
      new NextRequest("http://0.0.0.0:3006/api/feedback", {
        method: "POST",
        headers: {
          host: "localhost:3006",
          origin: "http://localhost:3006",
          "content-type": "application/json",
          "sec-fetch-site": "same-origin",
        },
        body: JSON.stringify(body),
      }),
    );
    expect(response.status).toBe(201);
  });
  it("distinguishes missing sessions from an unavailable auth provider", async () => {
    mocks.user = null;
    mocks.authError = { name: "AuthSessionMissingError", status: 400 };
    expect((await post()).status).toBe(401);
    mocks.authError = { name: "AuthRetryableFetchError", status: 0 };
    expect((await post()).status).toBe(503);
  });
  it("authenticates and uses the server owner, not a supplied user_id", async () => {
    expect((await post({ ...body, user_id: "attacker" })).status).toBe(201);
    expect(mocks.inserted.user_id).toBe("owner");
    mocks.user = null;
    expect((await post()).status).toBe(401);
  });
  it("requires same-origin JSON and rate limits writes", async () => {
    expect((await post(body, { origin: "https://other.test" })).status).toBe(
      403,
    );
    expect((await post(body, { "content-type": "text/plain" })).status).toBe(
      415,
    );
    mocks.allowed = false;
    expect((await post()).status).toBe(429);
  });
  it.each([
    { ...body, comment: " " },
    { ...body, comment: "x".repeat(2001) },
    { ...body, category: "invented" },
    { ...body, listing_id: "bad" },
    { ...body, comment: "a\u0000b" },
    null,
    [],
  ])("rejects invalid reports", async (payload) => {
    expect((await post(payload)).status).toBe(400);
    expect(mocks.inserted).toBeNull();
  });
  it("bounds streamed bodies even without Content-Length", async () => {
    expect((await post({ ...body, comment: "x".repeat(13000) })).status).toBe(
      413,
    );
    expect(mocks.inserted).toBeNull();
  });
  it("does not report success when the table, grants or transport fail", async () => {
    mocks.error = { code: "42P01", message: "private schema detail" };
    const response = await post();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.stringify(await response.json())).not.toContain(
      "private schema",
    );
  });
  it("only confirms duplicate IDs when the owned stored payload matches", async () => {
    mocks.error = { code: "23505" };
    mocks.existing = { ...body };
    expect((await post()).status).toBe(200);
    mocks.existing = null;
    expect((await post()).status).toBe(409);
    mocks.existing = { ...body, comment: "different" };
    expect((await post()).status).toBe(409);
  });
  it("reports the database daily cap without exposing its exception", async () => {
    mocks.error = { code: "P0001", message: "private" };
    expect((await post()).status).toBe(429);
  });
});
