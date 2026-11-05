import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MikeHuntLoader } from "@/components/brand/MikeHuntLoader";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("announces task transitions without repeating the decorative brand", () => {
  for (const [state, message] of [
    ["loading", "Checking vehicle"],
    ["error", "Checking vehicle failed"],
    ["loading", "Checking vehicle"],
    ["complete", "Checking vehicle complete"],
    ["idle", "Checking vehicle"],
  ] as const) {
    act(() =>
      root.render(
        <MikeHuntLoader state={state} size={48} label="Checking vehicle" />,
      ),
    );
    const status = host.querySelector<HTMLElement>('[role="status"]')!;
    expect(status.style.width).toBe("48px");
    expect(status.style.height).toBe("48px");
    expect(status.textContent).toBe(message);
    expect(status.getAttribute("data-state")).toBe(state);
    // A busy live region can defer announcements until the request finishes.
    expect(status.hasAttribute("aria-busy")).toBe(false);
    expect(host.querySelectorAll("img")).toHaveLength(1);
    expect(host.querySelector("img")!.getAttribute("aria-hidden")).toBe("true");
    expect(host.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
  }
});

it("suppresses artwork below 200ms, stays compact through shorter waits, and resets per request", () => {
  vi.useFakeTimers();
  const render = (state: "loading" | "complete" | "error") =>
    act(() =>
      root.render(
        <MikeHuntLoader state={state} size={64} label="Checking vehicle" />,
      ),
    );
  const visual = () =>
    host.querySelector<HTMLSpanElement>('span[aria-hidden="true"]')!;
  render("loading");
  expect(host.querySelector('[role="status"]')!.textContent).toBe(
    "Checking vehicle",
  );
  expect(visual().hidden).toBe(true);
  act(() => vi.advanceTimersByTime(199));
  expect(visual().hidden).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(visual().hidden).toBe(false);
  expect(visual().style.width).toBe("32px");
  act(() => vi.advanceTimersByTime(799));
  expect(visual().style.width).toBe("32px");
  act(() => vi.advanceTimersByTime(1));
  expect(visual().style.width).toBe("64px");
  render("error");
  expect(vi.getTimerCount()).toBe(0);
  render("loading");
  expect(visual().hidden).toBe(true);
  act(() => vi.advanceTimersByTime(100));
  render("complete");
  expect(visual().hidden).toBe(false);
  expect(host.textContent).toBe("Checking vehicle complete");
  expect(vi.getTimerCount()).toBe(0);
  render("loading");
  expect(visual().hidden).toBe(true);
  act(() => root.render(<MikeHuntLoader state="loading" size={20} />));
  act(() => vi.advanceTimersByTime(200));
  expect(visual().style.width).toBe("20px");
});

it("cancels visual timers on unmount", () => {
  vi.useFakeTimers();
  act(() => root.render(<MikeHuntLoader state="loading" />));
  expect(vi.getTimerCount()).toBe(2);
  act(() => root.render(null));
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps indeterminate motion separate from task text and actual completion", () => {
  vi.useFakeTimers();
  act(() =>
    root.render(<MikeHuntLoader state="loading" label="Checking vehicle" />),
  );
  for (const elapsed of [200, 1200, 1200, 1200, 1200, 4800]) {
    act(() => vi.advanceTimersByTime(elapsed));
    expect(host.querySelector('[role="status"]')!.textContent).toBe(
      "Checking vehicle",
    );
    expect(host.querySelector('[data-state="complete"]')).toBeNull();
  }
  for (const phase of ["scan", "discover", "evaluate", "reveal"]) {
    expect(
      host
        .querySelector(`[data-motion="${phase}"]`)!
        .closest('[aria-hidden="true"]'),
    ).not.toBeNull();
  }
  act(() =>
    root.render(<MikeHuntLoader state="complete" label="Checking vehicle" />),
  );
  expect(host.querySelector('[data-state="loading"]')).toBeNull();
  expect(host.textContent).toBe("Checking vehicle complete");
});
