import { createECDH } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publicKey: "",
  send: vi.fn(),
  configure: vi.fn(),
  delivery: vi.fn(),
  mark: vi.fn(),
}));
vi.mock("web-push", () => ({
  default: { sendNotification: mocks.send, setVapidDetails: mocks.configure },
}));
vi.mock("./vapid", () => ({
  get VAPID_PUBLIC_KEY() {
    return mocks.publicKey;
  },
}));
vi.mock("@/lib/alerts/delivery-tracking", () => ({
  createDelivery: mocks.delivery,
  markDeliverySent: mocks.mark,
}));

let privateKey: string;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const identity = createECDH("prime256v1");
  identity.generateKeys();
  privateKey = identity.getPrivateKey().toString("base64url");
  mocks.publicKey = identity.getPublicKey().toString("base64url");
  vi.stubEnv("VAPID_PRIVATE_KEY", privateKey);
  mocks.send.mockResolvedValue({ statusCode: 201 });
  mocks.delivery.mockResolvedValue("opaque-delivery");
  mocks.mark.mockResolvedValue(undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const keys = () => ({
  p256dh: mocks.publicKey,
  auth: Buffer.alloc(16).toString("base64url"),
});
const client = (rows: unknown[]) => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(async () => ({ data: rows })),
    })),
  })),
});

describe("push sender boundaries", () => {
  it("never sends or writes delivery tracking for an unsafe stored endpoint", async () => {
    const { sendPushToUser } = await import("./push");
    const sb = client([
      { id: "bad", endpoint: "https://127.0.0.1/private", ...keys() },
    ]);
    expect(
      await sendPushToUser(
        sb as never,
        "buyer-1",
        { title: "Test", body: "Test" },
        { kind: "price_drop" },
      ),
    ).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.delivery).not.toHaveBeenCalled();
  });
  it("retains tracked deal links and bounds provider requests", async () => {
    const { sendPushToUser } = await import("./push");
    const sb = client([
      { id: "own", endpoint: "https://fcm.googleapis.com/device", ...keys() },
    ]);
    expect(
      await sendPushToUser(
        sb as never,
        "buyer-1",
        { title: "Test", body: "Test", url: "/deal/car" },
        { kind: "price_drop", dealId: "car" },
      ),
    ).toBe(1);
    expect(mocks.delivery).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ userId: "buyer-1", dealId: "car" }),
    );
    expect(JSON.parse(mocks.send.mock.calls[0][1])).toMatchObject({
      url: "/api/t/c/opaque-delivery",
    });
    expect(mocks.send.mock.calls[0][2]).toEqual({ timeout: 10_000 });
  });
  it("does not claim configuration for mismatched identity keys", async () => {
    const other = createECDH("prime256v1");
    other.generateKeys();
    vi.stubEnv(
      "VAPID_PRIVATE_KEY",
      other.getPrivateKey().toString("base64url"),
    );
    const { isPushConfigured } = await import("./push");
    expect(await isPushConfigured(client([]) as never)).toBe(false);
    expect(mocks.configure).not.toHaveBeenCalled();
  });
  it("recovers after a temporary configuration failure instead of caching off forever", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100_000);
    vi.stubEnv("VAPID_PRIVATE_KEY", "invalid");
    const { isPushConfigured } = await import("./push");
    expect(await isPushConfigured(client([]) as never)).toBe(false);
    vi.stubEnv("VAPID_PRIVATE_KEY", privateKey);
    vi.mocked(Date.now).mockReturnValue(160_001);
    expect(await isPushConfigured(client([]) as never)).toBe(true);
  });
});
