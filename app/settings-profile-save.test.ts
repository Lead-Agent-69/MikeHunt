import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  prefs: {
    buyerScope: { buyerMode: "dealer" },
    profileContact: { phone: "5551234567" },
  },
  profile: { profile: { name: "Test dealer", recon_cost_default: 900 } },
  mutate: vi.fn(),
  save: vi.fn(),
}));
vi.mock("swr", () => ({
  default: () => ({
    data: state.profile,
    mutate: state.mutate,
    isLoading: false,
  }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner", loading: false }),
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "dealer" } }),
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({
    prefs: state.prefs,
    authed: true,
    isLoading: false,
    save: state.save,
  }),
}));
vi.mock("@/components/settings/BuyingProfilePrefs", () => ({
  BuyingProfilePrefs: () => null,
}));
vi.mock("@/components/settings/LocationPrefs", () => ({
  LocationPrefs: () => null,
}));
vi.mock("@/components/EnablePush", () => ({ EnablePush: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import SettingsPage from "./(dashboard)/settings/page";

describe("profile and cost persistence", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    state.mutate.mockReset();
    state.prefs.buyerScope.buyerMode = "dealer";
    state.save.mockResolvedValue({});
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(React.createElement(SettingsPage)));
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  async function submit() {
    await act(async () =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.startsWith("Save profile"))!
        .click(),
    );
  }
  it.each(["personal", "diy", "parts", "reseller", "dealer", "admin"])(
    "keeps %s settings role-appropriate and saves only visible cost fields",
    async (mode) => {
      state.prefs.buyerScope.buyerMode = mode;
      act(() => root.render(React.createElement(SettingsPage)));
      const business = mode === "reseller" || mode === "dealer";
      expect(host.textContent?.includes("Deal cost defaults")).toBe(business);
      expect(host.textContent?.includes("Business profile")).toBe(business);
      const fetch = vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => state.profile });
      vi.stubGlobal("fetch", fetch);
      await submit();
      const payload = JSON.parse(fetch.mock.calls[0][1].body);
      expect("target_profit" in payload).toBe(business);
      expect("recon_cost_default" in payload).toBe(business);
      expect(payload).not.toHaveProperty("role");
      expect(payload).not.toHaveProperty("plan");
    },
  );
  it("writes only schema-backed profile fields and keeps contact fields in owner preferences", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => state.profile });
    vi.stubGlobal("fetch", fetch);
    await submit();
    const payload = JSON.parse(fetch.mock.calls[0][1].body);
    expect(payload.recon_cost_default).toBe(900);
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("city");
    expect(payload).not.toHaveProperty("state");
    expect(payload).not.toHaveProperty("home_state");
    expect(state.save).toHaveBeenCalledWith({
      profileContact: expect.objectContaining({ phone: "5551234567" }),
    });
    expect(fetch.mock.calls[0][1].headers["x-require-account"]).toBe("true");
  });
  it("does not replace drafts or falsely mark a rejected profile save successful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: "Save failed" }),
      }),
    );
    await submit();
    expect(state.mutate).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Save failed");
    expect(host.textContent).not.toContain("Saved!");
  });
});
