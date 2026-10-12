import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  configured: true,
  error: null as unknown,
  email: "admin@example.test",
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.configured,
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: { email: mocks.email } },
    error: mocks.error,
  }),
}));
vi.mock("@/lib/auth/admin", () => ({
  isAdminEmail: (email: string | undefined) => email === "admin@example.test",
  isAdminConfigured: () => true,
}));
import { GET } from "./route";
beforeEach(() => {
  mocks.configured = true;
  mocks.error = null;
  mocks.email = "admin@example.test";
  vi.stubEnv("INGEST_SECRET", "test-machine-secret");
});
afterEach(() => vi.unstubAllEnvs());
describe("administrative health visibility", () => {
  it("keeps missing-config demo admins at the public tier", async () => {
    mocks.configured = false;
    const response = await GET(
      new NextRequest("https://app.test/api/admin/system"),
    );
    expect(Object.keys(await response.json()).sort()).toEqual([
      "status",
      "timestamp",
    ]);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("keeps failed verification and ordinary buyers at the public tier", async () => {
    mocks.error = new Error("verification failed");
    expect(
      await (
        await GET(new NextRequest("https://app.test/api/admin/system"))
      ).json(),
    ).not.toHaveProperty("memory");
    mocks.error = null;
    mocks.email = "buyer@example.test";
    expect(
      await (
        await GET(new NextRequest("https://app.test/api/admin/system"))
      ).json(),
    ).not.toHaveProperty("memory");
  });
  it("preserves verified admin and explicit machine-token visibility", async () => {
    expect(
      await (
        await GET(new NextRequest("https://app.test/api/admin/system"))
      ).json(),
    ).toHaveProperty("memory");
    mocks.configured = false;
    expect(
      await (
        await GET(
          new NextRequest("https://app.test/api/admin/system", {
            headers: { authorization: "Bearer test-machine-secret" },
          }),
        )
      ).json(),
    ).toHaveProperty("memory");
  });
});
