// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { matchesAnyRoute, matchesRoute } from "@/lib/auth/route-match";

describe("matchesRoute", () => {
  it("matches the route and nested paths, not prefix siblings", () => {
    expect(matchesRoute("/deal", "/deal")).toBe(true);
    expect(matchesRoute("/deal/abc", "/deal")).toBe(true);
    expect(matchesRoute("/dealer-network", "/deal")).toBe(false);
    expect(matchesRoute("/deal-check", "/deal")).toBe(false);
    expect(matchesRoute("/saved", "/save")).toBe(false);
    expect(matchesRoute("/api/alerts/unread", "/api/alerts")).toBe(true);
    expect(matchesRoute("/", "/")).toBe(true);
    expect(matchesRoute("/discover", "/")).toBe(false);
    expect(matchesAnyRoute("/scan", ["/scan", "/dealer-network"])).toBe(true);
  });
});

describe("proxy route gates (preview mode, no Supabase env)", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  async function run(path: string) {
    const { proxy } = await import("@/proxy");
    const res = await proxy(new NextRequest(`https://app.test${path}`));
    const location = res.headers.get("location");
    return location ? new URL(location).pathname : null;
  }

  it("keeps the dealer network public for signed-out visitors", async () => {
    expect(await run("/dealer-network")).toBeNull();
    expect(await run("/dealer-network/aeofmiami.com")).toBeNull();
    expect(await run("/scan")).toBeNull();
  });

  it("still sends signed-out visitors to sign in for protected pages", async () => {
    expect(await run("/deal/abc")).toBe("/login");
    expect(await run("/deal-check")).toBe("/login");
    expect(await run("/discover")).toBe("/login");
    expect(await run("/saved")).toBe("/login");
    expect(await run("/save")).toBe("/login");
  });

  it("keeps admin pages closed", async () => {
    expect(await run("/sources")).toBe("/login");
    expect(await run("/status")).toBe("/login");
  });
});
