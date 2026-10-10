import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryDeal } from "@/components/discovery/types";

const state = vi.hoisted(() => ({
  user: "one" as string | null,
  error: null as Error | null,
}));
const swr = vi.hoisted(() => vi.fn());
const mutate = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: state.user }),
}));
vi.mock("swr", () => ({
  default: (...args: unknown[]) => {
    swr(...args);
    return { error: state.error, data: null, mutate };
  },
}));
vi.mock("@/components/discovery/DiscoveryCard", () => ({
  DiscoveryCard: () => null,
}));
import { ForYouRail } from "@/components/reco/ForYouRail";

let root: Root;
let element: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.user = "one";
  state.error = null;
  swr.mockClear();
  mutate.mockClear();
  element = document.createElement("div");
  document.body.appendChild(element);
  root = createRoot(element);
});
afterEach(() => {
  act(() => root.unmount());
  element.remove();
  vi.unstubAllGlobals();
});
const render = (id = "deal-one") =>
  act(() =>
    root.render(
      React.createElement(ForYouRail, {
        flipDesk: false,
        eligibleDeals: [{ id } as DiscoveryDeal],
      }),
    ),
  );

describe("For You state", () => {
  it("keys cached recommendations by account and eligible listings", () => {
    render();
    expect(swr.mock.lastCall?.[0]).toEqual([
      "/api/reco/for-you",
      "one",
      "deal-one",
    ]);
    state.user = "two";
    render("deal-two");
    expect(swr.mock.lastCall?.[0]).toEqual([
      "/api/reco/for-you",
      "two",
      "deal-two",
    ]);
    state.user = null;
    render();
    expect(swr.mock.lastCall?.[0]).toBeNull();
  });
  it("shows a reachable retry control rather than hiding an outage", () => {
    state.error = new Error("private backend detail");
    render();
    expect(element.textContent).toContain("temporarily unavailable");
    expect(element.textContent).not.toContain("private backend detail");
    act(() =>
      element
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Retry recommendations"]',
        )!
        .click(),
    );
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
