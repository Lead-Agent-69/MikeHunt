// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  claims: null as null | { sub: string; email: string },
  onboarded: true,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => ({ data: { claims: auth.claims } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { onboarded: auth.onboarded },
            error: null,
          }),
        }),
      }),
    }),
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

beforeEach(() => {
  auth.claims = null;
  auth.onboarded = true;
});

describe("proxy: signed-out API calls get JSON, not a login redirect", () => {
  describe("production configuration failure", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      process.env = { ...ENV };
    });
    it("does not accept demo cookies for protected pages or APIs", async () => {
      for (const path of ["/saved", "/admin", "/api/saved-cars"]) {
        const response = await run(path, "mh_demo_user=forged-cookie");
        expect(response.status).toBe(503);
        expect(response.headers.get("location")).toBeNull();
        expect(await response.text()).not.toMatch(
          /supabase|misconfigured|service_role/i,
        );
      }
    });
    it("keeps sign-in and public information reachable", async () => {
      for (const path of ["/login", "/register", "/privacy"])
        expect((await run(path)).status).toBe(200);
    });
    it("treats malformed provider URLs as unavailable rather than throwing", async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = "not-a-url";
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
      expect((await run("/saved", "mh_demo_user=forged-cookie")).status).toBe(
        503,
      );
    });
  });
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

    it("requires sign-in for Sources while preserving its selected filters", async () => {
      const res = await run("/sources?state=MO");
      expect(res.status).toBe(307);
      const destination = new URL(res.headers.get("location")!);
      expect(destination.pathname).toBe("/login");
      expect(destination.searchParams.get("next")).toBe("/sources?state=MO");
    });

    it("lets an onboarded buyer view Sources without opening admin pages", async () => {
      auth.claims = { sub: "buyer-id", email: "buyer@example.test" };
      process.env.ADMIN_EMAIL = "admin@example.test";
      const res = await run("/sources");
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
      for (const path of ["/admin", "/status", "/developer", "/orchestrator"]) {
        expect(
          new URL((await run(path)).headers.get("location")!).pathname,
        ).toBe("/market");
      }
    });

    it("keeps unfinished source-coverage visitors in onboarding", async () => {
      auth.claims = { sub: "buyer-id", email: "buyer@example.test" };
      auth.onboarded = false;
      const res = await run("/sources");
      expect(new URL(res.headers.get("location")!).pathname).toBe(
        "/onboarding",
      );
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
