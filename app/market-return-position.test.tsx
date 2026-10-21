import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  MarketReturnPosition,
  rememberMarketPosition,
} from "@/components/market/MarketReturnPosition";

let root: Root;
let host: HTMLDivElement;
let card: HTMLElement;
const scrollTo = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
    setTimeout(() => cb(0), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  window.history.replaceState(
    { nextRouterState: "preserved" },
    "",
    "/market?mode=all",
  );
  window.sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  card = document.createElement("article");
  card.dataset.marketVehicle = "car-9";
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
    top: 280,
  } as DOMRect);
  document.body.append(card);
  scrollTo.mockClear();
  Object.defineProperty(document.documentElement, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  card.remove();
  delete (document.documentElement as Partial<HTMLElement>).scrollTo;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("records the selected card within its current history entry, preserving router state", () => {
  rememberMarketPosition(card);
  expect(window.history.state).toEqual({
    nextRouterState: "preserved",
    marketReturnPosition: {
      url: "/market?mode=all",
      id: "car-9",
      top: 280,
      savedAt: expect.any(Number),
    },
  });
  expect(
    JSON.parse(
      window.sessionStorage.getItem("mh-market-return-position-v1") || "{}",
    ),
  ).toMatchObject({ url: "/market?mode=all", id: "car-9", top: 280 });
});

it("restores after results mount and consumes only its own marker", async () => {
  rememberMarketPosition(card);
  vi.mocked(card.getBoundingClientRect).mockReturnValue({
    top: 1400,
  } as DOMRect);
  await act(async () => root.render(<MarketReturnPosition />));
  await act(async () => vi.runAllTimers());
  expect(scrollTo).toHaveBeenCalledWith({ top: 1120, behavior: "instant" });
  expect(window.history.state).toEqual({ nextRouterState: "preserved" });
  expect(
    window.sessionStorage.getItem("mh-market-return-position-v1"),
  ).toBeNull();
});

it("restores from session storage when the router replaces history metadata", async () => {
  rememberMarketPosition(card);
  window.history.replaceState({ nextRouterState: "new" }, "");
  vi.mocked(card.getBoundingClientRect).mockReturnValue({
    top: 900,
  } as DOMRect);
  await act(async () => root.render(<MarketReturnPosition />));
  await act(async () => vi.runAllTimers());
  expect(scrollTo).toHaveBeenCalledWith({ top: 620, behavior: "instant" });
  expect(window.history.state).toEqual({ nextRouterState: "new" });
  expect(
    window.sessionStorage.getItem("mh-market-return-position-v1"),
  ).toBeNull();
});

it("retries until asynchronous results mount, then restores", async () => {
  rememberMarketPosition(card);
  card.remove();
  await act(async () => root.render(<MarketReturnPosition />));
  await act(async () => vi.advanceTimersByTime(64));
  expect(scrollTo).not.toHaveBeenCalled();
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue({
    top: 1040,
  } as DOMRect);
  document.body.append(card);
  await act(async () => vi.runAllTimers());
  expect(scrollTo).toHaveBeenCalledWith({ top: 760, behavior: "instant" });
});

it("restarts restoration when Back reactivates a preserved market page", async () => {
  await act(async () => root.render(<MarketReturnPosition />));
  await act(async () => vi.runAllTimers());
  rememberMarketPosition(card);
  vi.mocked(card.getBoundingClientRect).mockReturnValue({
    top: 780,
  } as DOMRect);
  await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
  await act(async () => vi.runAllTimers());
  expect(scrollTo).toHaveBeenCalledWith({ top: 500, behavior: "instant" });
});

it("does not move a different search", async () => {
  rememberMarketPosition(card);
  window.history.replaceState(window.history.state, "", "/market?makes=Ford");
  await act(async () => root.render(<MarketReturnPosition />));
  await act(async () => vi.runAllTimers());
  expect(scrollTo).not.toHaveBeenCalled();
});

it("does not move results when the recorded vehicle is no longer present", async () => {
  rememberMarketPosition(card);
  card.remove();
  await act(async () => root.render(<MarketReturnPosition />));
  await act(async () => vi.runAllTimers());
  expect(scrollTo).not.toHaveBeenCalled();
});

it("cancels restoration when results unmount before the frame", async () => {
  rememberMarketPosition(card);
  await act(async () => root.render(<MarketReturnPosition />));
  await act(async () => root.render(null));
  await act(async () => vi.runAllTimers());
  expect(scrollTo).not.toHaveBeenCalled();
});
