import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },
  success: vi.fn(),
  error: vi.fn(),
  local: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/hooks/useBuyerIntent", async (original) => ({
  ...(await original<object>()),
  writeLocalBuyerIntent: mocks.local,
}));
import OnboardingPage from "./onboarding/page";
let root: Root;
let container: HTMLDivElement;
let mode = "personal";
let guestSave = false;
let failProfile = false;
let failRead = false;
let writes: string[];
beforeEach(() => {
  vi.clearAllMocks();
  mode = "personal";
  guestSave = false;
  failProfile = false;
  failRead = false;
  writes = [];
  window.history.replaceState({}, "", "/onboarding?edit=1");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options?: RequestInit) => {
      if (!options?.method) {
        if (failRead) return new Response("{}", { status: 503 });
        return Response.json(
          url === "/api/profile"
            ? { profile: { id: "owner", onboarded: false } }
            : {
                authed: true,
                prefs: { buyerScope: { buyerMode: mode, state: "Nationwide" } },
              },
        );
      }
      writes.push(url);
      if (url === "/api/preferences")
        return Response.json({
          authed: !guestSave,
          local: guestSave,
          prefs: JSON.parse(options.body as string),
        });
      return failProfile
        ? new Response("{}", { status: 503 })
        : Response.json({ profile: { id: "owner", onboarded: true } });
    }),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => root.render(React.createElement(OnboardingPage)));
}
async function click(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === text,
  )!;
  expect(button).toBeTruthy();
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
}
async function review() {
  for (let index = 0; index < 3; index++) await click("Continue");
}
describe("onboarding completion", () => {
  for (const buyerMode of ["personal", "diy", "parts", "reseller", "dealer"]) {
    it(`completes ${buyerMode} only after both confirmed saves`, async () => {
      mode = buyerMode;
      await mount();
      await review();
      await click("See my matches");
      expect(writes).toEqual(["/api/preferences", "/api/profile"]);
      expect(mocks.local.mock.calls[0][0].buyerMode).toBe(buyerMode);
      expect(mocks.router.push).toHaveBeenCalledOnce();
      expect(mocks.success).toHaveBeenCalledOnce();
    });
  }
  it("does not mark a guest fallback as completed account setup", async () => {
    guestSave = true;
    await mount();
    await review();
    await click("See my matches");
    expect(writes).toEqual(["/api/preferences"]);
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(
      expect.stringContaining("session has expired"),
    );
  });
  it("keeps partial-save failures retryable without navigation or local completion", async () => {
    failProfile = true;
    await mount();
    await review();
    await click("See my matches");
    expect(mocks.local).not.toHaveBeenCalled();
    expect(mocks.router.push).not.toHaveBeenCalled();
    failProfile = false;
    await click("See my matches");
    expect(mocks.router.push).toHaveBeenCalledOnce();
  });
  it("blocks failed hydration and lets users retry the read", async () => {
    failRead = true;
    await mount();
    expect(container.textContent).toContain("could not be loaded");
    expect(
      Array.from(container.querySelectorAll("button")).find(
        (button) => button.textContent === "Profile unavailable",
      )?.disabled,
    ).toBe(true);
    failRead = false;
    await click("Retry loading profile");
    expect(container.textContent).not.toContain("could not be loaded");
    await click("Continue");
  });
});
