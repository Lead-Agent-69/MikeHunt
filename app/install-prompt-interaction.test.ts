import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/discover" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
import {
  InstallPrompt,
  INSTALL_DONE_KEY,
  INSTALL_DISMISSED_KEY,
  INSTALL_SESSIONS_KEY,
  markInstallEngagement,
} from "@/components/InstallPrompt";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  route.pathname = "/discover";
  localStorage.clear();
  sessionStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});
const render = async () => {
  await act(async () => root.render(React.createElement(InstallPrompt)));
};
async function offer(outcome: "accepted" | "dismissed" = "accepted") {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = Object.assign(
    new Event("beforeinstallprompt", { cancelable: true }),
    {
      prompt,
      userChoice: Promise.resolve({ outcome }),
    },
  );
  await act(async () => window.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(true);
  return prompt;
}
const region = () => container.querySelector('[role="region"]');

describe("install prompt interaction", () => {
  it("keeps the first visit clear until engagement", async () => {
    await render();
    await offer();
    expect(region()).toBeNull();
    await act(async () => markInstallEngagement());
    expect(region()).not.toBeNull();
    expect(region()?.parentElement?.className).not.toMatch(
      /\bfixed\b|\bsticky\b/,
    );
    expect(localStorage.getItem(INSTALL_SESSIONS_KEY)).toBe("1");
  });
  it("retains the offer across navigation without covering a deal or login", async () => {
    localStorage.setItem(INSTALL_SESSIONS_KEY, "1");
    await render();
    await offer();
    expect(region()).not.toBeNull();
    for (const pathname of ["/deal/123", "/login", "/deal-check", "/swipe"]) {
      route.pathname = pathname;
      await render();
      expect(region()).toBeNull();
    }
    route.pathname = "/saved";
    await render();
    expect(region()).not.toBeNull();
    expect(localStorage.getItem(INSTALL_SESSIONS_KEY)).toBe("2");
  });
  it("Escape dismisses and the next mount respects that choice", async () => {
    localStorage.setItem(INSTALL_SESSIONS_KEY, "1");
    await render();
    await offer();
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(region()).toBeNull();
    expect(Number(localStorage.getItem(INSTALL_DISMISSED_KEY))).toBeGreaterThan(
      0,
    );
    await act(async () => root.render(null));
    await render();
    await act(async () =>
      window.dispatchEvent(new Event("beforeinstallprompt")),
    );
    expect(region()).toBeNull();
  });
  it("only records installation after appinstalled, not merely accepting the dialog", async () => {
    localStorage.setItem(INSTALL_SESSIONS_KEY, "1");
    await render();
    const prompt = await offer();
    const install = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Install",
    );
    expect(install).toBeTruthy();
    await act(async () => install!.click());
    expect(prompt).toHaveBeenCalledOnce();
    expect(region()).toBeNull();
    expect(localStorage.getItem(INSTALL_DONE_KEY)).toBeNull();
    await act(async () => window.dispatchEvent(new Event("appinstalled")));
    expect(Number(localStorage.getItem(INSTALL_DONE_KEY))).toBeGreaterThan(0);
  });
  it("remembers a browser-dialog rejection", async () => {
    localStorage.setItem(INSTALL_SESSIONS_KEY, "1");
    await render();
    await offer("dismissed");
    const install = Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent === "Install",
    );
    await act(async () => install!.click());
    expect(region()).toBeNull();
    expect(Number(localStorage.getItem(INSTALL_DISMISSED_KEY))).toBeGreaterThan(
      0,
    );
    expect(localStorage.getItem(INSTALL_DONE_KEY)).toBeNull();
  });
});
