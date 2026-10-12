import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { detachPushForLogout } from "./device-logout";
const unsubscribe = vi.fn();
let original: PropertyDescriptor | undefined;
beforeEach(() => {
  original = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  unsubscribe.mockReset().mockResolvedValue(true);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => ({
        pushManager: {
          getSubscription: async () => ({
            endpoint: "https://fcm.googleapis.com/device",
            unsubscribe,
          }),
        },
      }),
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
});
afterEach(() => {
  if (original) Object.defineProperty(navigator, "serviceWorker", original);
  else Reflect.deleteProperty(navigator, "serviceWorker");
  vi.unstubAllGlobals();
});
describe("device alert logout", () => {
  it("deduplicates concurrent logout and auth-event cleanup", async () => {
    await Promise.all([detachPushForLogout(), detachPushForLogout()]);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("revokes the device before contacting the authenticated delete endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        expect(unsubscribe).toHaveBeenCalledOnce();
        return new Response("{}");
      }),
    );
    await detachPushForLogout();
    expect(fetch).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/device" }),
      }),
    );
  });
  it("blocks logout preparation when local device revocation fails", async () => {
    unsubscribe.mockResolvedValue(false);
    await expect(detachPushForLogout()).rejects.toThrow("Could not detach");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows logout after local revocation despite a remote outage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(detachPushForLogout()).resolves.toBeUndefined();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("does not wait for a service worker that was never registered", async () => {
    navigator.serviceWorker.getRegistration = vi
      .fn()
      .mockResolvedValue(undefined);
    await detachPushForLogout();
    expect(fetch).not.toHaveBeenCalled();
  });
});
