import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextBestBuySpotlight } from "@/components/deal/NextBestBuySpotlight";

const buyer = vi.hoisted(() => ({ query: "" }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: buyer.query }),
  buildBuyerIntentQuery: (intent: string) => new URLSearchParams(intent),
}));
let root: Root;
let container: HTMLDivElement;
let pending: Array<{
  url: string;
  signal: AbortSignal;
  resolve: (response: Response) => void;
}>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  buyer.query = "";
  pending = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string, options: { signal: AbortSignal }) =>
        new Promise<Response>((resolve) =>
          pending.push({ url, signal: options.signal, resolve }),
        ),
    ),
  );
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = (initialState = "") =>
  act(async () =>
    root.render(React.createElement(NextBestBuySpotlight, { initialState })),
  );
const respond = (index: number, title: string | null, status = 200) =>
  act(async () => {
    pending[index].resolve(
      new Response(
        JSON.stringify({
          bestBuy: title
            ? {
                id: title,
                title,
                askPrice: 10000,
                locationState: "MO",
              }
            : null,
        }),
        { status, headers: { "Content-Type": "application/json" } },
      ),
    );
  });

it("aborts old scopes and ignores late responses even when transport ignores abort", async () => {
  await render("MO");
  await render("TX");
  expect(pending[0].signal.aborted).toBe(true);
  expect(pending[1].url).toContain("state=TX");
  await respond(1, "Current Texas car");
  expect(container.textContent).toContain("Current Texas car");
  await respond(0, "Stale Missouri car");
  expect(container.textContent).toContain("Current Texas car");
  expect(container.textContent).not.toContain("Stale Missouri car");
});

it("clears old recommendations on failure and supports retry without raw diagnostics", async () => {
  await render("MO");
  await respond(0, "Old car");
  await render("TX");
  expect(container.textContent).not.toContain("Old car");
  await respond(1, "private SQL diagnostic", 503);
  expect(container.textContent).toContain("We couldn't check a listing");
  expect(container.textContent).not.toMatch(/Old car|SQL/);
  await act(async () => container.querySelector("button")!.click());
  expect(container.getAttribute("aria-busy")).toBeNull();
  expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  expect(pending).toHaveLength(3);
  await respond(2, "Retry car");
  expect(container.textContent).toContain("Retry car");
});

it("removes an old state when the buyer switches to nationwide", async () => {
  buyer.query = "state=MO";
  await render();
  expect(pending[0].url).toContain("state=MO");
  buyer.query = "";
  await render();
  expect(pending[1].url).not.toContain("state=");
  expect(pending[0].signal.aborted).toBe(true);
});

it("budget changes request only the current budget and scope", async () => {
  await render("MO");
  await respond(0, "First car");
  const button = Array.from(container.querySelectorAll("button")).find(
    (item) => item.textContent === "< $6,000",
  )!;
  await act(async () => button.click());
  expect(pending[1].url).toContain("capital=6000");
  expect(pending[1].url).toContain("state=MO");
  expect(container.textContent).not.toContain("First car");
});

it("treats a successful empty response as no recommendation, not an error", async () => {
  await render();
  await respond(0, null);
  expect(container.textContent).toBe("");
});

it("cancels on navigation/unmount", async () => {
  await render();
  await act(async () => root.unmount());
  expect(pending[0].signal.aborted).toBe(true);
  await respond(0, "Too late");
  expect(container.textContent).toBe("");
});
