import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VAPID_PUBLIC_KEY } from "@/lib/notifications/vapid";

const mocks = vi.hoisted(() => ({
  user: { id: "buyer-1" } as { id: string } | null,
  from: vi.fn(),
  upsert: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  error: null as unknown,
  allowed: true,
}));
vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: mocks.user } }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from: mocks.from }),
}));
vi.mock("@/lib/api/http-error", () => ({
  internalError: () => new Response("{}", { status: 500 }),
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: mocks.allowed }),
  tooManyRequests: () => new Response("{}", { status: 429 }),
}));
import { POST, DELETE } from "./route";

const endpoint = "https://fcm.googleapis.com/opaque-device";
const sub = {
  endpoint,
  keys: {
    p256dh: VAPID_PUBLIC_KEY,
    auth: Buffer.alloc(16).toString("base64url"),
  },
};
const request = (body: unknown) =>
  new NextRequest("https://app.test/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "buyer-1" };
  mocks.allowed = true;
  mocks.error = null;
  const query = {
    eq: mocks.eq,
    get error() {
      return mocks.error;
    },
  };
  mocks.eq.mockReturnValue(query);
  mocks.delete.mockReturnValue(query);
  mocks.upsert.mockImplementation(async () => ({ error: mocks.error }));
  mocks.from.mockReturnValue({ upsert: mocks.upsert, delete: mocks.delete });
});

describe("owned push subscriptions", () => {
  it("never reads or writes subscriptions for signed-out requests", async () => {
    mocks.user = null;
    expect((await POST(request(sub))).status).toBe(401);
    expect((await DELETE(request({ endpoint }))).status).toBe(401);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects arbitrary servers and bad keys before storing them", async () => {
    for (const body of [
      { ...sub, endpoint: "https://127.0.0.1/" },
      { ...sub, keys: {} },
    ]) {
      expect((await POST(request(body))).status).toBe(400);
    }
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("binds a valid subscription to the session owner, never the supplied user id", async () => {
    expect(
      (await POST(request({ ...sub, user_id: "other-buyer" }))).status,
    ).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "buyer-1", endpoint }),
      { onConflict: "user_id,endpoint" },
    );
  });
  it("bounds registration requests before a database write", async () => {
    mocks.allowed = false;
    expect((await POST(request(sub))).status).toBe(429);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("does not turn an absent or malformed device into delete-all", async () => {
    for (const body of [null, {}, { endpoint: "" }])
      expect((await DELETE(request(body))).status).toBe(400);
    expect(mocks.delete).not.toHaveBeenCalled();
  });
  it("deletes only the owner's requested device and surfaces failure", async () => {
    expect(
      (await DELETE(request({ endpoint, user_id: "other-buyer" }))).status,
    ).toBe(200);
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "buyer-1");
    expect(mocks.eq).toHaveBeenCalledWith("endpoint", endpoint);
    mocks.error = { message: "database unavailable" };
    expect((await DELETE(request({ endpoint }))).status).toBe(500);
  });
});
