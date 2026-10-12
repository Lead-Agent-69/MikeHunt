import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "buyer-1" } as { id: string } | null,
  configured: false,
  allowed: true,
  sent: 0,
  send: vi.fn(),
  client: {},
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: mocks.user } }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => mocks.client,
}));
vi.mock("@/lib/notifications/push", () => ({
  isPushConfigured: async () => mocks.configured,
  sendPushToUser: mocks.send,
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: mocks.allowed }),
  tooManyRequests: () => new Response("{}", { status: 429 }),
}));
import { POST } from "./route";

const request = () =>
  new NextRequest("https://app.test/api/push/test", {
    method: "POST",
    body: JSON.stringify({ userId: "other-buyer" }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "buyer-1" };
  mocks.allowed = true;
  mocks.configured = false;
  mocks.send.mockImplementation(async () => mocks.sent);
  mocks.sent = 0;
});

describe("test notifications", () => {
  it("requires a verified session", async () => {
    mocks.user = null;
    expect((await POST(request())).status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not pretend an unconfigured sender succeeded", async () => {
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ configured: false, sent: 0 });
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rate-limits requests without sending", async () => {
    mocks.allowed = false;
    expect((await POST(request())).status).toBe(429);
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("ignores supplied user ids and sends only to the session owner's devices", async () => {
    mocks.configured = true;
    mocks.sent = 1;
    const response = await POST(request());
    expect(mocks.send).toHaveBeenCalledWith(
      mocks.client,
      "buyer-1",
      expect.objectContaining({ url: "/alerts" }),
    );
    expect(await response.json()).toEqual({ configured: true, sent: 1 });
  });
});
