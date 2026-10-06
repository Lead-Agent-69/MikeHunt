// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getServerUser = vi.hoisted(() => vi.fn());
const hasAuthSessionCookie = vi.hoisted(() => vi.fn(async () => false));
const configured = vi.hoisted(() => ({ value: true }));
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server-supabase", () => ({
  getServerUser,
  hasAuthSessionCookie,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => configured.value,
  createServerComponentClient: () => ({ from }),
}));

import { GET, POST } from "./route";

beforeEach(() => {
  configured.value = true;
  getServerUser.mockReset();
  hasAuthSessionCookie.mockReset();
  hasAuthSessionCookie.mockResolvedValue(false);
  from.mockReset();
});

describe("/api/alerts/unread for signed-out visitors", () => {
  it("GET returns count 0 without an auth round trip or a database query", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(getServerUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("POST is a quiet no-op without a session", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(getServerUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 0 when Supabase is not configured, even with a demo cookie", async () => {
    configured.value = false;
    hasAuthSessionCookie.mockResolvedValue(true);
    const res = await GET();
    expect(await res.json()).toEqual({ count: 0 });
    expect(getServerUser).not.toHaveBeenCalled();
  });

  it("a stale cookie with no valid user still answers 0 without querying", async () => {
    hasAuthSessionCookie.mockResolvedValue(true);
    getServerUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(await res.json()).toEqual({ count: 0 });
    expect(from).not.toHaveBeenCalled();
  });

  it("an auth error is swallowed as count 0, never a 500", async () => {
    hasAuthSessionCookie.mockResolvedValue(true);
    getServerUser.mockRejectedValue(new Error("auth down"));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
  });
});

describe("/api/alerts/unread for a signed-in user", () => {
  it("counts only that user's unread inbox rows", async () => {
    hasAuthSessionCookie.mockResolvedValue(true);
    getServerUser.mockResolvedValue({ data: { user: { id: "u1" } } });
    const eqs: Array<[string, string]> = [];
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => {
        eqs.push([col, val]);
        return eqs.length >= 2
          ? Promise.resolve({ count: 3, error: null })
          : chain;
      }),
    };
    from.mockReturnValue(chain);
    const res = await GET();
    expect(await res.json()).toEqual({ count: 3 });
    expect(from).toHaveBeenCalledWith("user_feed_inbox");
    expect(eqs).toEqual([
      ["user_id", "u1"],
      ["status", "unread"],
    ]);
  });
});
