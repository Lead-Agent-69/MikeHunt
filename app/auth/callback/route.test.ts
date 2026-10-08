import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  exchange: vi.fn(),
  user: vi.fn(),
  bootstrap: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { exchangeCodeForSession: mocks.exchange, getUser: mocks.user },
  }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: vi.fn(),
}));
vi.mock("@/lib/auth/account-bootstrap", () => ({
  ensureAccountRows: mocks.bootstrap,
}));
vi.mock("@/lib/preferences/merge-guest-prefs", () => ({
  mergeGuestPrefsOnSignup: vi.fn(),
  GUEST_PREFS_COOKIE: "guest",
}));
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchange.mockResolvedValue({ error: null });
  mocks.user.mockResolvedValue({ data: { user: { id: "own-user" } } });
  mocks.bootstrap.mockResolvedValue({ onboarded: false });
});

describe("recovery callbacks", () => {
  it("exchanges the recovery code and bypasses account setup only for the reset destination", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.com/auth/callback?code=test-code&next=/reset-password",
      ),
    );
    expect(mocks.exchange).toHaveBeenCalledWith("test-code");
    expect(response.headers.get("location")).toBe(
      "https://example.com/reset-password",
    );
    expect(mocks.bootstrap).not.toHaveBeenCalled();
  });
  it("gives expired or missing recovery codes a recovery-specific retry path", async () => {
    mocks.exchange.mockResolvedValueOnce({ error: { message: "expired" } });
    for (const query of [
      "code=bad&next=/reset-password",
      "next=/reset-password",
    ]) {
      const response = await GET(
        new NextRequest(`https://example.com/auth/callback?${query}`),
      );
      expect(response.headers.get("location")).toBe(
        "https://example.com/reset-password?error=expired",
      );
    }
  });
  it("preserves onboarding for ordinary sign-in", async () => {
    const response = await GET(
      new NextRequest("https://example.com/auth/callback?code=test-code"),
    );
    expect(mocks.bootstrap).toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://example.com/onboarding",
    );
  });
  it("recovers from a provider connection failure without a server error", async () => {
    mocks.exchange.mockRejectedValueOnce(new Error("connection failed"));
    const response = await GET(
      new NextRequest(
        "https://example.com/auth/callback?code=test&next=/reset-password",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.com/reset-password?error=expired",
    );
  });
  it("does not treat a missing user as a verified recovery session", async () => {
    mocks.user.mockResolvedValueOnce({ data: { user: null } });
    const response = await GET(
      new NextRequest(
        "https://example.com/auth/callback?code=test&next=/reset-password",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.com/reset-password?error=expired",
    );
  });
  it("does not redirect a callback to an external destination", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.com/auth/callback?code=test-code&next=https://evil.example",
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://example.com/onboarding",
    );
  });
});
