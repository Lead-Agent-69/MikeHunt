import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mode: undefined as string | undefined,
  loading: true,
  owner: "account-a",
  accountLoading: false,
}));
const preload = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("swr", () => ({ preload }));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({
    intent: state.mode ? { buyerMode: state.mode } : null,
  }),
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({
    prefs: { buyerScope: { buyerMode: state.mode } },
    isLoading: state.loading,
  }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: state.owner, loading: state.accountLoading }),
}));
vi.mock("@/components/saved/PurchasePipeline", () => ({
  PurchasePipeline: () => React.createElement("h1", null, "Purchase plan"),
}));
import { FlipDeskGate } from "@/components/shared/FlipDeskGate";
import { savedCollectionKey, fetchSavedPage } from "@/lib/saved/collection";

afterEach(() => {
  preload.mockReset();
  preload.mockResolvedValue(undefined);
  Object.assign(state, {
    mode: undefined,
    loading: true,
    owner: "account-a",
    accountLoading: false,
  });
  vi.unstubAllGlobals();
});

async function mount(route: "/fleet" | "/lane" = "/fleet") {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = () =>
    act(async () =>
      root.render(<FlipDeskGate route={route}>Dealer tools</FlipDeskGate>),
    );
  await render();
  return { host, render, close: () => act(async () => root.unmount()) };
}

describe("account-scoped purchase checklist preloading", () => {
  it("does not preload while preferences are pending or after resolving a dealer desk", async () => {
    const h = await mount();
    try {
      expect(preload).not.toHaveBeenCalled();
      Object.assign(state, { mode: "dealer", loading: false });
      await h.render();
      expect(h.host.textContent).toBe("Dealer tools");
      expect(preload).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
  for (const mode of ["personal", "diy", "parts"]) {
    it(`warms the confirmed ${mode} account's checklist`, async () => {
      Object.assign(state, { mode, loading: false });
      const h = await mount();
      try {
        expect(h.host.textContent).toBe("Purchase plan");
        expect(preload).toHaveBeenCalledWith(
          savedCollectionKey("account-a", "checklist-page", "all"),
          fetchSavedPage,
        );
      } finally {
        await h.close();
      }
    });
  }
  it("handles a rejected speculative preload without claiming its data loaded", async () => {
    Object.assign(state, { mode: "personal", loading: false });
    preload.mockRejectedValueOnce(
      new TypeError("NetworkError when attempting to fetch resource"),
    );
    const h = await mount();
    try {
      expect(preload).toHaveBeenCalledOnce();
    } finally {
      await h.close();
    }
  });
  it("does not preload before account ownership is confirmed", async () => {
    Object.assign(state, {
      mode: "personal",
      loading: false,
      accountLoading: true,
    });
    const h = await mount();
    try {
      expect(preload).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
  it("does not preload a checklist for a different tool route", async () => {
    Object.assign(state, { mode: "dealer", loading: false });
    const h = await mount("/lane");
    try {
      expect(preload).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });
});
