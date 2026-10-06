// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: { claims: null } }) },
    from: () => ({}),
  }),
}));

const ENV = { ...process.env };

async function run(path: string, cookie?: string) {
  vi.resetModules();
  const { proxy } = await import("@/proxy");
  const req = new NextRequest(`https://mikehunt.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
  return proxy(req);
}

describe("proxy: signed-out API calls get JSON, not a login redirect", () => {
  describe("with Supabase configured", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcd.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-test";
    });
    afterEach(() => {
      process.env = { ...ENV };
    });

    it("lets /api/alerts/unread through for the TopNav badge", async () => {
      const res = await run("/api/alerts/unread");
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("answers user-scoped APIs with 401 JSON", async () => {
      for (const path of ["/api/saved-cars", "/api/alerts", "/api/watchlist"]) {
        const res = await run(path);
        expect(res.status).toBe(401);
        expect(res.headers.get("location")).toBeNull();
        expect(await res.json()).toEqual({
          error: "Sign in required",
          signInRequired: true,
        });
      }
    });

    it("still redirects protected pages to /login", async () => {
      const res = await run("/saved");
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toContain("/login");
    });

    it("cron endpoints stay outside the session gate", async () => {
      const res = await run("/api/alerts/process");
      expect(res.status).toBe(200);
    });
  });

  describe("without Supabase (demo mode)", () => {
    beforeEach(() => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    });
    afterEach(() => {
      process.env = { ...ENV };
    });

    it("lets /api/alerts/unread through", async () => {
      const res = await run("/api/alerts/unread");
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    });

    it("answers user-scoped APIs with 401 JSON", async () => {
      const res = await run("/api/saved-cars");
      expect(res.status).toBe(401);
      expect((await res.json()).signInRequired).toBe(true);
    });

    it("still redirects protected pages to /login", async () => {
      const res = await run("/alerts");
      expect(res.status).toBe(307);
    });
  });
});
