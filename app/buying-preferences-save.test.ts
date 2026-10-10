import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const account = vi.hoisted(() => ({
  prefs: {
    buyerScope: {
      buyerMode: "dealer",
      minPrice: 1000,
      maxPrice: 5000,
      makes: ["Ford"],
      includeRepairable: false,
      watchedDealers: ["keep.example"],
    },
  },
  save: vi.fn(),
  authed: true,
  isLoading: false,
}));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => account }));
import { BuyingProfilePrefs } from "@/components/settings/BuyingProfilePrefs";

describe("buying preferences", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    account.save.mockReset();
    account.prefs.buyerScope.buyerMode = "dealer";
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(React.createElement(BuyingProfilePrefs)));
  });
  it.each(["personal", "diy", "parts", "reseller", "dealer"])(
    "provides working, relevant controls for %s without an admin option",
    async (mode) => {
      account.prefs.buyerScope.buyerMode = mode;
      act(() => root.render(React.createElement(BuyingProfilePrefs)));
      expect(host.textContent?.includes("Repair experience")).toBe(
        mode === "diy",
      );
      expect(host.textContent?.includes("Maximum donor price")).toBe(
        mode === "parts",
      );
      expect(
        Array.from(host.querySelectorAll("option")).map(
          (option) => option.value,
        ),
      ).not.toContain("admin");
      account.save.mockResolvedValue({});
      await act(async () =>
        host.querySelector<HTMLButtonElement>("button")!.click(),
      );
      expect(account.save.mock.calls[0][0].buyerScope.buyerMode).toBe(mode);
      expect(account.save.mock.calls[0][0]).not.toHaveProperty("role");
      expect(account.save.mock.calls[0][0]).not.toHaveProperty("plan");
    },
  );
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  it("saves working scope parameters without dropping other buyer settings", async () => {
    account.save.mockResolvedValue({});
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(account.save).toHaveBeenCalledWith({
      buyerScope: expect.objectContaining({
        buyerMode: "dealer",
        minPrice: 1000,
        maxPrice: 5000,
        preferredMakes: ["Ford"],
        makes: ["Ford"],
        includeRepairable: false,
        watchedDealers: ["keep.example"],
      }),
    });
    expect(host.textContent).toContain("saved to your account");
    expect(host.textContent).toContain("Seller type");
    expect(host.textContent).toContain("Vehicle types");
    expect(host.textContent).not.toContain("Admin");
  });
  it("preserves changes and offers retry after failure", async () => {
    account.save.mockRejectedValue(new Error("unavailable"));
    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click(),
    );
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "Try again",
    );
    expect(
      host.querySelector<HTMLInputElement>('input[type="number"]')!.value,
    ).toBe("1000");
    expect(host.querySelector<HTMLButtonElement>("button")!.disabled).toBe(
      false,
    );
  });
});
