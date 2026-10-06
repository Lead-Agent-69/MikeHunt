// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loginNextFor, loginRedirectUrl } from "@/lib/auth/login-redirect";

describe("loginNextFor", () => {
  it("keeps same-origin page paths with their query", () => {
    expect(loginNextFor("/saved")).toBe("/saved");
    expect(loginNextFor("/discover", "?state=TX&mode=personal")).toBe(
      "/discover?state=TX&mode=personal",
    );
  });

  it("drops anything that is not a safe relative page path", () => {
    expect(loginNextFor("//evil.example/x")).toBeNull();
    expect(loginNextFor("/\\evil.example")).toBeNull();
    expect(loginNextFor("/api/saved-cars")).toBeNull();
    expect(loginNextFor("/login", "?next=/saved")).toBeNull();
    expect(loginNextFor("/")).toBeNull();
  });
});

describe("loginRedirectUrl", () => {
  it("moves the original query into next instead of onto /login", () => {
    const url = loginRedirectUrl(
      new URL("https://app.test/discover?state=TX#rails"),
    );
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/discover?state=TX");
    expect(url.searchParams.get("state")).toBeNull();
    expect(url.origin).toBe("https://app.test");
  });
});

describe("proxy keeps ?next= (preview/demo mode)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  async function redirectFor(path: string) {
    const { proxy } = await import("@/proxy");
    const res = await proxy(new NextRequest(`https://app.test${path}`));
    const location = res.headers.get("location");
    return location ? new URL(location) : null;
  }

  it("sends signed-out visitors to /login?next=<where they were going>", async () => {
    const saved = await redirectFor("/saved");
    expect(saved?.pathname).toBe("/login");
    expect(saved?.searchParams.get("next")).toBe("/saved");

    const deal = await redirectFor("/deal/abc?from=alerts");
    expect(deal?.searchParams.get("next")).toBe("/deal/abc?from=alerts");
    expect(deal?.searchParams.get("from")).toBeNull();
  });

  it("keeps next for admin pages too", async () => {
    const status = await redirectFor("/status");
    expect(status?.pathname).toBe("/login");
    expect(status?.searchParams.get("next")).toBe("/status");
  });
});
