import { beforeEach, expect, it, vi } from "vitest";
import { invalidate } from "@/lib/cache";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  admin: vi.fn(),
  client: vi.fn(),
}));
vi.mock("@/lib/auth/admin-operations", () => ({
  canManageOperations: mocks.admin,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: mocks.client,
}));
vi.mock("@/lib/auth/provider-readiness", async (original) => ({
  ...(await original<typeof import("@/lib/auth/provider-readiness")>()),
  readAuthProviderReadiness: mocks.read,
}));
import { GET } from "./route";

const request = () =>
  new Request("http://localhost/api/system/status?scope=auth") as any;
const provider = {
  reachable: true,
  google: true,
  email: true,
  checkedAt: "2026-10-13T00:00:00Z",
  source: "supabase-auth-settings",
  error: "private diagnostics",
};
beforeEach(() => {
  invalidate("status:auth-providers:");
  vi.clearAllMocks();
});

it("coalesces simultaneous cold auth reads and caches successful provider settings", async () => {
  let resolve!: (value: typeof provider) => void;
  mocks.read.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const first = GET(request());
  const second = GET(request());
  expect(mocks.read).toHaveBeenCalledTimes(1);
  resolve(provider);
  const bodies = await Promise.all(
    [first, second].map(async (response) => (await response).json()),
  );
  expect(bodies[0]).toEqual(bodies[1]);
  expect(bodies[0].authProviders).not.toHaveProperty("error");
  expect(bodies[0].authProviders).not.toHaveProperty("source");
  await GET(request());
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.admin).not.toHaveBeenCalled();
  expect(mocks.client).not.toHaveBeenCalled();
});

it("keeps unreachable settings unknown and retries after recovery", async () => {
  mocks.read.mockResolvedValueOnce({
    ...provider,
    reachable: false,
    google: null,
    email: null,
  });
  expect((await (await GET(request())).json()).authProviders.google).toBeNull();
  mocks.read.mockResolvedValueOnce(provider);
  expect((await (await GET(request())).json()).authProviders.google).toBe(true);
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it("releases a rejected in-flight read so later requests can recover", async () => {
  mocks.read.mockRejectedValueOnce(new Error("transient failure"));
  await expect(GET(request())).rejects.toThrow("transient failure");
  mocks.read.mockResolvedValueOnce(provider);
  expect((await (await GET(request())).json()).authProviders.google).toBe(true);
});
