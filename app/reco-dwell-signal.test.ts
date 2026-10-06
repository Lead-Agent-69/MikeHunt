import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/reco/client", () => ({
  sendDealSignal: (i: unknown) => send(i),
}));

import {
  useDealDwellSignal,
  DWELL_SIGNAL_MIN_MS,
} from "@/hooks/useDealDwellSignal";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const DEAL = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function Probe({ id, enabled }: { id: string; enabled: boolean }) {
  useDealDwellSignal(id, enabled);
  return null;
}

let root: Root;
let el: HTMLDivElement;
let now = 0;
const mount = (id = DEAL, enabled = true) =>
  act(() => root.render(React.createElement(Probe, { id, enabled })));
const unmount = () => act(() => root.unmount());
const setVisibility = (v: "visible" | "hidden") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => v,
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

beforeEach(() => {
  send.mockReset();
  now = 0;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  el = document.createElement("div");
  root = createRoot(el);
});
afterEach(() => vi.restoreAllMocks());

describe("useDealDwellSignal", () => {
  it("sends one dwell with the visible time when the user leaves", () => {
    mount();
    now = 42_000;
    unmount();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({
      dealId: DEAL,
      kind: "dwell",
      dwellMs: 42_000,
    });
  });

  it("sends nothing under the 5s threshold", () => {
    mount();
    now = DWELL_SIGNAL_MIN_MS - 1;
    unmount();
    expect(send).not.toHaveBeenCalled();
  });

  it("sends nothing for guests or non-UUID ids", () => {
    mount(DEAL, false);
    now = 60_000;
    unmount();
    root = createRoot(el);
    mount("not-a-uuid", true);
    now = 120_000;
    unmount();
    expect(send).not.toHaveBeenCalled();
  });

  it("counts only visible time and sends once when the tab is hidden", () => {
    mount();
    now = 3_000;
    setVisibility("hidden"); // 3s visible: below threshold, nothing yet
    now = 100_000;
    setVisibility("visible");
    now = 104_000;
    setVisibility("hidden"); // 7s visible in total
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].dwellMs).toBe(7_000);
    now = 200_000;
    unmount();
    expect(send).toHaveBeenCalledTimes(1);
  });
});
