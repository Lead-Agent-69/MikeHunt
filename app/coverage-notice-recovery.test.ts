import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CoverageNotice } from "@/components/discovery/CoverageNotice";
import {
  buildDiscoverCoverage,
  unavailableCoverage,
} from "@/lib/discovery/coverage";

vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: {} }),
}));
let root: Root;
let container: HTMLDivElement;
const retry = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  retry.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("keeps coverage numbers available behind a keyboard-native disclosure", async () => {
  const coverage = buildDiscoverCoverage({
    marketRows: [
      {
        source: "craigslist",
        location_state: "MO",
        last_seen_at: "2026-10-10T12:00:00Z",
      },
    ],
    feedRows: [],
    states: ["MO"],
    rowCap: 5000,
    now: new Date("2026-10-10T12:00:00Z"),
  });
  await act(async () =>
    root.render(React.createElement(CoverageNotice, { coverage })),
  );
  expect(container.textContent).toContain("Limited results for MO");
  expect(container.querySelector("details")?.open).toBe(false);
  expect(container.querySelector("summary")?.textContent).toBe(
    "About these results",
  );
  expect(container.textContent).toContain("1 recent listing");
  expect(container.querySelector('a[href="/settings"]')).not.toBeNull();
  expect(container.querySelector('a[href="/searches"]')).not.toBeNull();
});

it("opens failure context and disables retry for the real refresh lifecycle", async () => {
  const render = (isRefreshing: boolean) =>
    act(async () =>
      root.render(
        React.createElement(CoverageNotice, {
          coverage: unavailableCoverage("private SQL diagnostic"),
          onRetry: retry,
          isRefreshing,
        }),
      ),
    );
  await render(false);
  expect(container.querySelector("details")?.open).toBe(true);
  expect(container.textContent).not.toContain("private SQL diagnostic");
  await act(async () => container.querySelector("button")!.click());
  expect(retry).toHaveBeenCalledOnce();
  await render(true);
  expect(container.querySelector("button")?.disabled).toBe(true);
  expect(container.querySelector("button")?.getAttribute("aria-busy")).toBe(
    "true",
  );
  await act(async () => container.querySelector("button")!.click());
  expect(retry).toHaveBeenCalledOnce();
  expect(container.textContent).toContain("Refreshing results");
  await render(false);
  expect(container.querySelector("button")?.disabled).toBe(false);
  expect(container.textContent).toContain("Try again");
});
