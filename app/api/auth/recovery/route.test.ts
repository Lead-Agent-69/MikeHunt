import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ verifyOtp: vi.fn(), allowed: true }));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: mocks.allowed, retryAfter: 60 }),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: any) => ({
    auth: {
      verifyOtp: async (input: unknown) => {
        options.cookies.setAll([
          {
            name: "sb-test-session",
            value: "verified-session",
            options: { path: "/", httpOnly: true },
          },
        ]);
        return mocks.verifyOtp(input);
      },
    },
  }),
}));
import { POST } from "./route";
const token = `pkce_${"a".repeat(56)}`;
const request = (
  body: unknown = { token_hash: token },
  origin = "https://dealerhunt.vercel.app",
) =>
  new NextRequest("https://dealerhunt.vercel.app/api/auth/recovery", {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed = true;
  mocks.verifyOtp.mockResolvedValue({
    data: { user: { id: "owner" }, session: { access_token: "session" } },
    error: null,
  });
});
it("returns session cookies only after recovery verification, never password changes", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(response.cookies.get("sb-test-session")?.value).toBe(
    "verified-session",
  );
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ verified: true });
  expect(mocks.verifyOtp).toHaveBeenCalledWith({
    token_hash: token,
    type: "recovery",
  });
});
it("rejects cross-origin attempts before consuming the token", async () => {
  expect((await POST(request(undefined, "https://other.example"))).status).toBe(
    403,
  );
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
});
it("rejects malformed tokens and rate-limited attempts without verification", async () => {
  expect((await POST(request({ token_hash: "invalid" }))).status).toBe(400);
  mocks.allowed = false;
  expect((await POST(request())).status).toBe(429);
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
});
it("does not leak provider errors or staged cookies for expired and reused links", async () => {
  mocks.verifyOtp.mockResolvedValueOnce({
    data: { user: null, session: null },
    error: { message: "private provider error" },
  });
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect(response.cookies.getAll()).toEqual([]);
  expect(await response.text()).not.toContain("private provider error");
});
it("does not report success without a session or after a network failure", async () => {
  mocks.verifyOtp.mockResolvedValueOnce({
    data: { user: { id: "owner" }, session: null },
    error: null,
  });
  expect((await POST(request())).status).toBe(400);
  mocks.verifyOtp.mockRejectedValueOnce(new Error("network"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(response.cookies.getAll()).toEqual([]);
});
