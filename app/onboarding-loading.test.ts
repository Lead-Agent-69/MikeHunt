import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const router = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("@/components/brand/MikeHuntLogo", () => ({
  MikeHuntLogo: () => null,
}));
import OnboardingPage from "./onboarding/page";
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", "/onboarding?edit=1");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("blocks Continue until saved preferences arrive", async () => {
  let resolve!: (value: unknown) => void;
  const pending = new Promise((r) => {
    resolve = r;
  });
  vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending));
  await act(async () => {
    root.render(React.createElement(OnboardingPage));
  });
  expect(
    Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Loading profile"),
    )?.disabled,
  ).toBe(true);
  await act(async () => {
    resolve({
      ok: true,
      json: async () => ({
        prefs: {
          buyerScope: {
            buyerMode: "personal",
            vehicles: ["Trucks"],
            state: "MO",
          },
        },
      }),
    });
  });
  const next = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Continue"),
  )!;
  expect(next.disabled).toBe(false);
  act(() => next.click());
  expect(
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === "Trucks")
      ?.getAttribute("aria-pressed"),
  ).toBe("true");
});
it("offers recovery rather than replacing failed preferences with defaults", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: false });
  vi.stubGlobal("fetch", fetchMock);
  await act(async () => {
    root.render(React.createElement(OnboardingPage));
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Retry before saving",
  );
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ prefs: {} }) });
  await act(async () => {
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Retry loading"))!
      .click();
  });
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(
    Array.from(host.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Continue"),
    )?.disabled,
  ).toBe(false);
});
