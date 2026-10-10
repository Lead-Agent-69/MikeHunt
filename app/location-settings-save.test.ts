import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const account = vi.hoisted(() => ({
  prefs: { homeLocation: { state: "MO", zip: "63021" } },
  save: vi.fn(),
  authed: true,
  isLoading: false,
}));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => account }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { LocationPrefs } from "@/components/settings/LocationPrefs";

describe("location settings saves", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    account.save.mockReset();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(React.createElement(LocationPrefs)));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  it("preserves the ZIP draft and shows an inline error after failure", async () => {
    account.save.mockRejectedValue(new Error("network"));
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click();
    });
    expect(host.querySelector<HTMLInputElement>("#home-zip")!.value).toBe(
      "63021",
    );
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "Your changes are still here",
    );
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(
      false,
    );
  });
  it("saves the complete location without taking the user away from settings", async () => {
    account.save.mockResolvedValue({});
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click();
    });
    expect(account.save).toHaveBeenCalledWith(
      expect.objectContaining({
        homeLocation: { state: "MO", zip: "63021" },
        carsState: "MO",
        carsStates: ["MO"],
      }),
    );
    expect(host.textContent).toContain("Home saved to your account");
    expect(host.querySelector("#home-zip")).not.toBeNull();
  });
});
