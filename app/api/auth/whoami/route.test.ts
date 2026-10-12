import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  configured: true,
  user: { id: "buyer-1", email: "buyer@example.test" } as {
    id: string;
    email: string;
  } | null,
  error: null as unknown,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.configured,
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({
    data: { user: mocks.user },
    error: mocks.error,
  }),
}));
vi.mock("@/lib/auth/admin", () => ({ isAdminEmail: () => false }));
import { GET } from "./route";
beforeEach(() => {
  mocks.configured = true;
  mocks.user = { id: "buyer-1", email: "buyer@example.test" };
  mocks.error = null;
});
describe("notification identity proof", () => {
  it("marks only configured error-free authenticated identities as verified", async () => {
    const response = await GET();
    expect(await response.json()).toMatchObject({
      id: "buyer-1",
      verified: true,
    });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
  it("does not mark demo identities as verified", async () => {
    mocks.configured = false;
    expect(await (await GET()).json()).toMatchObject({
      verified: false,
      demo: true,
    });
  });
  it("does not mark failed verification or signed-out identities as verified", async () => {
    mocks.error = new Error("verification failed");
    expect(await (await GET()).json()).toMatchObject({ verified: false });
    mocks.error = null;
    mocks.user = null;
    expect(await (await GET()).json()).toMatchObject({
      verified: false,
      id: null,
    });
  });
});
