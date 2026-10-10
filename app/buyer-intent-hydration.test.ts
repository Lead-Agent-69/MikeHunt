import React, { act } from "react";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
const preferences = vi.hoisted(() => ({
  prefs: {} as { buyerScope?: { buyerMode: string } },
  authed: true,
  isLoading: false,
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => preferences,
}));
import { BUYER_INTENT_KEY, useBuyerIntent } from "@/hooks/useBuyerIntent";

describe("account buyer scope hydration", () => {
  beforeAll(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
  afterAll(() => vi.unstubAllGlobals());
  afterEach(() => {
    localStorage.clear();
    preferences.prefs = {};
    preferences.authed = true;
  });
  it("restores a dealer desk from the account on a fresh device", () => {
    preferences.prefs = { buyerScope: { buyerMode: "dealer" } };
    const node = document.createElement("div");
    const root = createRoot(node);
    function Scope() {
      const { intent } = useBuyerIntent();
      return React.createElement("span", null, intent?.buyerMode || "none");
    }
    act(() => root.render(React.createElement(Scope)));
    expect(node.textContent).toBe("dealer");
    act(() => root.unmount());
  });

  it("does not grant a new personal account a previous user's local dealer desk", () => {
    localStorage.setItem(
      BUYER_INTENT_KEY,
      JSON.stringify({ buyerMode: "dealer" }),
    );
    preferences.prefs = { buyerScope: { buyerMode: "personal" } };
    const node = document.createElement("div");
    const root = createRoot(node);
    function Scope() {
      const { intent } = useBuyerIntent();
      return React.createElement("span", null, intent?.buyerMode || "none");
    }
    act(() => root.render(React.createElement(Scope)));
    expect(node.textContent).toBe("personal");
    act(() => root.unmount());
  });
  it.each(["personal", "diy", "parts", "reseller", "dealer"])(
    "keeps saved %s mode after browser-local scope events",
    (buyerMode) => {
      preferences.prefs = { buyerScope: { buyerMode } };
      const node = document.createElement("div");
      const root = createRoot(node);
      function Scope() {
        const { intent } = useBuyerIntent();
        return React.createElement("span", null, intent?.buyerMode || "none");
      }
      act(() => root.render(React.createElement(Scope)));
      act(() => {
        localStorage.setItem(
          BUYER_INTENT_KEY,
          JSON.stringify({ buyerMode: "dealer" }),
        );
        window.dispatchEvent(new Event("mh-buyer-scope-change"));
        window.dispatchEvent(new Event("storage"));
      });
      expect(node.textContent).toBe(buyerMode);
      act(() => root.unmount());
    },
  );
});
