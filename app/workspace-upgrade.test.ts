import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ choose: vi.fn(), dealer: false }));
vi.mock("@/hooks/useWorkspace", () => ({
  useWorkspace: () => ({
    expanded: false,
    choose: mocks.choose,
    authed: true,
    isLoading: false,
    community: false,
  }),
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({
    intent: { buyerMode: mocks.dealer ? "dealer" : "personal" },
  }),
}));
import Page from "./(dashboard)/upgrade/page";
afterEach(() => {
  mocks.dealer = false;
  mocks.choose.mockReset();
  vi.unstubAllGlobals();
});
it("offers an optional free upgrade and waits for confirmed persistence", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Page)));
  expect(host.textContent).toContain("No card, checkout");
  expect(host.textContent).not.toContain("$29");
  mocks.choose.mockRejectedValueOnce(new Error("failed"));
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "not confirmed",
  );
  expect(host.querySelector("[role=status]")).toBeNull();
  mocks.choose.mockResolvedValueOnce(undefined);
  await act(async () => host.querySelector("button")!.click());
  expect(mocks.choose).toHaveBeenCalledWith("expanded");
  expect(host.querySelector("[role=status]")?.textContent).toContain(
    "confirmed",
  );
  act(() => root.unmount());
});
