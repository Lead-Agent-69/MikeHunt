import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  configured: true,
  error: null as unknown,
  mutate: vi.fn(),
  success: vi.fn(),
  failure: vi.fn(),
  unsubscribe: vi.fn(),
  requestPermission: vi.fn(),
}));
vi.mock("swr", () => ({
  default: () => ({
    data: { configured: mocks.configured },
    error: mocks.error,
    isLoading: false,
    isValidating: false,
    mutate: mocks.mutate,
  }),
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.failure },
}));
import { EnablePush } from "@/components/EnablePush";

let root: Root;
let container: HTMLDivElement;
let originalWorker: PropertyDescriptor | undefined;
let originalPush: PropertyDescriptor | undefined;
let originalNotification: PropertyDescriptor | undefined;

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.error = null;
  originalWorker = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
  originalPush = Object.getOwnPropertyDescriptor(window, "PushManager");
  originalNotification = Object.getOwnPropertyDescriptor(
    window,
    "Notification",
  );
  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      permission: "granted",
      requestPermission: mocks.requestPermission,
    },
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: async () => ({
            endpoint: "https://fcm.googleapis.com/device",
            unsubscribe: mocks.unsubscribe,
          }),
        },
      }),
    },
  });
  mocks.unsubscribe.mockResolvedValue(true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  for (const [object, key, original] of [
    [navigator, "serviceWorker", originalWorker],
    [window, "PushManager", originalPush],
    [window, "Notification", originalNotification],
  ] as const) {
    if (original) Object.defineProperty(object, key, original);
    else Reflect.deleteProperty(object, key);
  }
  vi.unstubAllGlobals();
});
const render = async () => {
  await act(async () => {
    root.render(React.createElement(EnablePush));
  });
};
const click = async (label: string) => {
  const button = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(label),
  );
  expect(button).toBeTruthy();
  await act(async () => {
    button!.click();
  });
};

describe("push controls stay honest and usable", () => {
  it("does not claim opt-out succeeded after a failed server delete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("{}", { status: 500 })),
    );
    await render();
    await click("turn off");
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.failure).toHaveBeenCalled();
    expect(container.textContent).toContain("turn off");
  });
  it("keeps opt-out reachable even when push sending is unconfigured", async () => {
    mocks.configured = false;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    await render();
    expect(container.textContent).not.toContain("Send test");
    expect(container.textContent).not.toContain("Email alerts still");
    await click("turn off");
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("exposes explicit status recovery without promising notification delivery", async () => {
    mocks.error = new Error("status unavailable");
    await render();
    const retry = container.querySelector<HTMLButtonElement>(
      '[aria-label="Retry push status"]',
    );
    expect(retry).not.toBeNull();
    await act(async () => {
      retry!.click();
    });
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(container.textContent).not.toContain("Send test");
  });
  it("describes test sends as provider submissions, not proof this device received them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response('{"sent":1}')),
    );
    await render();
    await click("Send test");
    expect(mocks.success).toHaveBeenCalledWith(
      "Test sent to your subscribed devices.",
    );
  });
});
