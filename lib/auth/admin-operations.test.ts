import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: true,
  email: "admin@example.test",
  error: null as unknown,
  getUser: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.configured,
}));
vi.mock("@/lib/auth/admin", () => ({
  isAdminEmail: (email: string | undefined) => email === "admin@example.test",
}));
vi.mock("@/lib/server-supabase", () => ({ getServerUser: mocks.getUser }));
import { canManageOperations } from "./admin-operations";
beforeEach(() => {
  mocks.configured = true;
  mocks.email = "admin@example.test";
  mocks.error = null;
  mocks.getUser.mockReset().mockImplementation(async () => ({
    data: { user: { email: mocks.email } },
    error: mocks.error,
  }));
  vi.stubEnv("INGEST_SECRET", "test-machine-secret");
});
afterEach(() => vi.unstubAllEnvs());
describe("administrative authorization", () => {
  it("never authorizes a demo admin under missing verified-auth configuration", async () => {
    mocks.configured = false;
    expect(
      await canManageOperations(new Request("https://app.test/admin")),
    ).toBe(false);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("requires error-free verification and an approved administrator", async () => {
    const request = new Request("https://app.test/admin");
    expect(await canManageOperations(request)).toBe(true);
    mocks.error = new Error("verification failed");
    expect(await canManageOperations(request)).toBe(false);
    mocks.error = null;
    mocks.email = "buyer@example.test";
    expect(await canManageOperations(request)).toBe(false);
  });
  it("preserves the explicit machine-token path without enabling session fallbacks", async () => {
    mocks.configured = false;
    expect(
      await canManageOperations(
        new Request("https://app.test/admin", {
          headers: { authorization: "Bearer test-machine-secret" },
        }),
      ),
    ).toBe(true);
    expect(
      await canManageOperations(
        new Request("https://app.test/admin", {
          headers: { authorization: "Bearer wrong-secret" },
        }),
      ),
    ).toBe(false);
  });
});
