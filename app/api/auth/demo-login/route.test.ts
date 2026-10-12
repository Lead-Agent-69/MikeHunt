import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ configured: false }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.configured,
}));
import { POST } from "./route";
const request = () =>
  new NextRequest("https://app.test/api/auth/demo-login", {
    method: "POST",
    body: JSON.stringify({ email: "preview@example.test" }),
  });
afterEach(() => {
  mocks.configured = false;
  vi.unstubAllEnvs();
});
describe("demo login isolation", () => {
  it("never issues production demo credentials under missing auth configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
  it("retains local development preview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("mh_demo_user=");
  });
  it("does not issue demo credentials when real authentication is configured", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.configured = true;
    expect((await POST(request())).status).toBe(404);
  });
});
