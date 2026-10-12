import { describe, expect, it } from "vitest";
import { VAPID_PUBLIC_KEY } from "./vapid";
import { isSafePushEndpoint, parsePushSubscription } from "./subscription";

const subscription = {
  endpoint: "https://fcm.googleapis.com/opaque-device",
  keys: {
    p256dh: VAPID_PUBLIC_KEY,
    auth: Buffer.alloc(16).toString("base64url"),
  },
};

describe("browser push subscription boundaries", () => {
  it.each([
    "https://fcm.googleapis.com/opaque-device",
    "https://updates.push.services.mozilla.com/wpush/v2/device",
    "https://web.push.apple.com/device",
    "https://wns2.notify.windows.com/device?token=opaque",
  ])("accepts the documented provider endpoint %s", (endpoint) => {
    expect(isSafePushEndpoint(endpoint)).toBe(true);
    expect(parsePushSubscription({ ...subscription, endpoint })).not.toBeNull();
  });
  it.each([
    "https://localhost/device",
    "http://fcm.googleapis.com/device",
    "https://127.0.0.1/device",
    "https://169.254.169.254/device",
    "https://fcm.googleapis.com.evil.example/device",
    "https://evilpush.apple.com/device",
    "https://evilnotify.windows.com/device",
    "https://user:secret@fcm.googleapis.com/device",
    "https://fcm.googleapis.com:8443/device",
    "https://fcm.googleapis.com/device#fragment",
    "https://fcm.googleapis.com/\ndevice",
    "https://fcm.googleapis.com/" + "x".repeat(4096),
  ])("rejects unsafe destinations %s", (endpoint) => {
    expect(isSafePushEndpoint(endpoint)).toBe(false);
    expect(parsePushSubscription({ ...subscription, endpoint })).toBeNull();
  });
  it("requires bounded, valid-size browser encryption keys", () => {
    for (const keys of [
      null,
      {},
      { p256dh: "short", auth: subscription.keys.auth },
      { ...subscription.keys, auth: "short" },
      { ...subscription.keys, auth: "x".repeat(1000) },
    ]) {
      expect(parsePushSubscription({ ...subscription, keys })).toBeNull();
    }
    expect(parsePushSubscription(null)).toBeNull();
    expect(
      parsePushSubscription({ ...subscription, extra: "ignored" }),
    ).toEqual(subscription);
  });
});
