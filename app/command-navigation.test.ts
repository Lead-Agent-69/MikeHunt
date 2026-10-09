import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ mode: "personal", push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => state }));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: state.mode } }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "user-one", loading: false }),
}));
import { CommandPalette } from "@/components/shared/CommandPalette";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  state.mode = "personal";
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  // JSDOM does not implement native modal dialogs; browser QA covers focus containment.
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () => root.render(React.createElement(CommandPalette)));
  await act(async () =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", ctrlKey: true }),
    ),
  );
}
describe("role-aware keyboard navigation", () => {
  it("offers a purchase plan instead of business tools to a personal buyer", async () => {
    await open();
    expect(host.querySelector("dialog")?.open).toBe(true);
    expect(host.textContent).toContain("Purchase plan");
    expect(host.textContent).not.toContain("Auction Lane");
    expect(host.textContent).not.toContain("Finance");
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent?.includes("Purchase plan"))!
        .click(),
    );
    expect(state.push).toHaveBeenCalledWith("/fleet");
    expect(host.querySelector("dialog")).toBeNull();
  });
  it("retains sourcing and decision destinations, not retired tools, and dismisses on Escape", async () => {
    state.mode = "dealer";
    await open();
    expect(host.textContent).toContain("Auction Lane");
    expect(host.textContent).not.toContain("Finance");
    expect(host.textContent).not.toContain("List vehicles");
    expect(host.textContent).not.toContain("Volume sourcing");
    expect(host.textContent).toContain("Search cars");
    expect(host.textContent).toContain("Outcomes & intelligence");
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(host.querySelector("dialog")).toBeNull();
    expect(state.push).not.toHaveBeenCalled();
  });
});
