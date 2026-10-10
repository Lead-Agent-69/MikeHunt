import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  getUser: vi.fn(),
  bootstrap: vi.fn(),
  merge: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: any) => ({
    auth: {
      exchangeCodeForSession: async (code: string) => {
        options.cookies.setAll([
          {
            name: "sb-test-auth-token",
            value: "session",
            options: { httpOnly: true },
          },
        ]);
        return mocks.exchange(code);
      },
      getUser: mocks.getUser,
    },
  }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({}),
}));
vi.mock("@/lib/auth/account-bootstrap", () => ({
  ensureAccountRows: mocks.bootstrap,
}));
vi.mock("@/lib/preferences/merge-guest-prefs", () => ({
  mergeGuestPrefsOnSignup: mocks.merge,
  GUEST_PREFS_COOKIE: "guest",
}));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  });
  mocks.bootstrap.mockResolvedValue({ onboarded: false });
});
const request = (query: string) =>
  new NextRequest(`http://localhost/auth/callback?${query}`);

describe("password recovery callback", () => {
  it("retains exchanged cookies and a new account's intended vehicle through onboarding", async () => {
    const response = await GET(request("code=oauth&next=/deal/123"));
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("session");
    expect(response.headers.get("location")).toBe(
      "http://localhost/onboarding?next=%2Fdeal%2F123",
    );
  });
  it("preserves a returning account's intended vehicle", async () => {
    mocks.bootstrap.mockResolvedValueOnce({ onboarded: true });
    const response = await GET(request("code=oauth&next=/deal/123"));
    expect(response.headers.get("location")).toBe("http://localhost/deal/123");
  });
  it("exchanges the code and retains session cookies without onboarding or provisioning", async () => {
    const response = await GET(request("code=recovery&next=/reset-password"));
    expect(response.headers.get("location")).toBe(
      "http://localhost/reset-password",
    );
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("session");
    expect(mocks.exchange).toHaveBeenCalledWith("recovery");
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.merge).not.toHaveBeenCalled();
  });
  it("makes missing or expired links recoverable rather than redirecting to login", async () => {
    expect(
      (await GET(request("next=/reset-password"))).headers.get("location"),
    ).toContain("/reset-password?error=invalid_link");
    mocks.exchange.mockResolvedValue({ error: { message: "expired" } });
    expect(
      (await GET(request("code=expired&next=/reset-password"))).headers.get(
        "location",
      ),
    ).toContain("/reset-password?error=invalid_link");
  });
  it("does not accept an exchange without a verified user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(
      (await GET(request("code=bad&next=/reset-password"))).headers.get(
        "location",
      ),
    ).toContain("error=invalid_link");
  });
  it("offers a new link after a thrown exchange failure", async () => {
    mocks.exchange.mockRejectedValue(new Error("fetch failed"));
    expect(
      (await GET(request("code=bad&next=/reset-password"))).headers.get(
        "location",
      ),
    ).toContain("error=invalid_link");
  });
  it("retains cookies when normal account setup fails", async () => {
    mocks.bootstrap.mockRejectedValue(new Error("unavailable"));
    const response = await GET(request("code=oauth"));
    expect(response.headers.get("location")).toContain(
      "/login?error=account_setup",
    );
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("session");
  });
  it("rejects external next URLs", async () => {
    expect(
      (await GET(request("code=oauth&next=https://example.com"))).headers.get(
        "location",
      ),
    ).toBe("http://localhost/onboarding");
  });
});
