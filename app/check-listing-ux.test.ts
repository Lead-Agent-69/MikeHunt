import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CheckAnyListing,
  VERDICT,
  announceRead,
} from "@/components/intelligence/CheckAnyListing";
import type { CheckListingRead } from "@/lib/intelligence/check-listing";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const base: CheckListingRead = {
  desk: "flip",
  vehicle: {
    year: 2018,
    make: "Honda",
    model: "Civic",
    trim: "EX",
    mileage: 71000,
    price: 9500,
    state: "IL",
  },
  verdict: "buy",
  headline: "About $1,900 under the Buy ceiling.",
  live: { state: "unknown", label: "" },
  fairValue: {
    value: 12800,
    basis: "measured",
    state: "IL",
    comps: 14,
    label: "Dealer resale · 14 recent sales",
    kind: "sold",
    range: null,
  },
  priceRating: null,
  maxBuy: { value: 11400, basis: "measured", targetProfit: 1300 },
  resale: { value: 14900, basis: "measured", state: "TX" },
  profit: {
    net: 2100,
    basis: "measured",
    fees: 400,
    transport: 600,
    recon: 300,
    repair: 0,
    sellingCost: 200,
  },
  confidence: { label: "high", score: 0.8 },
  why: ["Valued on 14 recent sales in TX."],
  assumptions: [],
  comps: {
    asks: 9,
    sold: 14,
    compKind: "sold",
    compScope: "state",
    newestAt: null,
  },
  trend: null,
  priceHistory: null,
};

const thin: CheckListingRead = {
  ...base,
  verdict: "not_enough_data",
  headline: "Not enough data: fewer than 5 comparable cars to value this one.",
  fairValue: {
    value: null,
    basis: "insufficient",
    state: null,
    comps: 2,
    label: null,
    kind: "none",
    range: null,
  },
  maxBuy: { value: null, basis: "insufficient", targetProfit: null },
  resale: { value: null, basis: "insufficient", state: null },
  profit: { ...base.profit!, net: null, basis: "insufficient" },
  confidence: { label: "none", score: 0 },
  why: [
    "We found 2 recent asking prices and 0 sales for this car; we need at least 5 to price it.",
  ],
};

const personal: CheckListingRead = {
  ...base,
  desk: "personal",
  verdict: "pass",
  headline: "Overpriced by about $1,200. Fair value is $11,000.",
  priceRating: "over",
  fairValue: {
    ...base.fairValue,
    value: 11000,
    range: { p25: 10200, p75: 11900 },
  },
  maxBuy: { value: 11000, basis: "measured", targetProfit: null },
  resale: { value: null, basis: "measured", state: null },
  profit: null,
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const $ = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const reply = (status: number, body: unknown) =>
  vi
    .fn()
    .mockResolvedValue({ ok: status < 400, status, json: async () => body });

async function submit(text = "2018 Civic 71k $9,500 60432") {
  const input = host.querySelector("input") as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => {
    (host.querySelector("form") as HTMLFormElement).requestSubmit();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("Check any listing UX", () => {
  it("empty state: labelled input, helper text, live region, no numbers", () => {
    act(() => root.render(createElement(CheckAnyListing, {})));
    const input = host.querySelector("input")!;
    const label = host.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toMatch(/Listing link, VIN, or car details/);
    expect(input.getAttribute("aria-describedby")).toBe($("check-empty")?.id);
    expect($("check-announce")?.getAttribute("aria-live")).toBe("polite");
    expect(host.textContent).not.toMatch(/\$\d/);
  });

  it("result: verdict heading first, then Buy at or under, headline, then secondary; focus moves to it", async () => {
    vi.stubGlobal("fetch", reply(200, { read: base }));
    act(() => root.render(createElement(CheckAnyListing, { homeState: "IL" })));
    await submit();
    const card = $("check-card")!;
    const verdict = $("check-verdict")!;
    expect(verdict.tagName).toBe("H3");
    expect(card.firstElementChild).toBe(verdict);
    expect(verdict.nextElementSibling).toBe($("check-primary"));
    expect($("check-primary")!.nextElementSibling).toBe($("check-headline"));
    expect(verdict.textContent).toBe("Buy");
    expect(verdict.querySelector("svg")).not.toBeNull();
    expect(document.activeElement).toBe(verdict);
    expect($("check-primary")?.textContent).toBe("Buy at or under$11,400");
    expect(card.querySelectorAll(".text-3xl")).toHaveLength(1);
    expect($("check-fair")?.textContent).toContain("$12,800");
    expect($("check-profit")?.textContent).toContain("Profit · sell in TX");
    expect($("check-announce")?.textContent).toBe(
      "Verdict: Buy. Buy at or under $11,400. About $1,900 under the Buy ceiling.",
    );
    expect(card.textContent).not.toMatch(/\blive asks?\b/i);
  });

  it("not enough data yet: no invented numbers, Why open", async () => {
    vi.stubGlobal("fetch", reply(200, { read: thin }));
    act(() => root.render(createElement(CheckAnyListing, {})));
    await submit();
    const card = $("check-card")!;
    expect($("check-verdict")?.textContent).toBe("Not enough data yet");
    expect($("check-primary")).toBeNull();
    expect($("check-fair")).toBeNull();
    expect($("check-profit")).toBeNull();
    expect($("check-thin")).not.toBeNull();
    expect(card.querySelector("details")?.open).toBe(true);
    // Only the asking price from the input appears as money.
    expect(card.textContent!.match(/\$\d[\d,]*/g)).toEqual(["$9,500"]);
    expect(card.textContent).toContain(
      "Not enough comparable sales yet to value this car.",
    );
    expect(card.textContent).not.toMatch(/Values are not enough/);
  });

  it("personal desk Pass: neutral pill, word in --t1, fair value with range, no profit", async () => {
    vi.stubGlobal("fetch", reply(200, { read: personal }));
    act(() => root.render(createElement(CheckAnyListing, {})));
    await submit();
    const verdict = $("check-verdict") as HTMLElement;
    expect(verdict.textContent).toBe("Pass");
    expect(verdict.className).toContain("text-[var(--t1)]");
    expect(verdict.style.background).toBe("var(--s2)");
    expect($("check-headline")?.textContent).toMatch(
      /^Over market · Overpriced/,
    );
    expect($("check-fair")?.textContent).toContain(
      "Middle half $10,200–$11,900",
    );
    expect($("check-profit")).toBeNull();
  });

  it("server error: InlineError with Try again that re-runs the same query", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({
          error: "Market data is temporarily unavailable. Please try again.",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ read: base }),
      });
    vi.stubGlobal("fetch", f);
    act(() => root.render(createElement(CheckAnyListing, {})));
    await submit("1HGCM82633A004352");
    const err = $("check-error")!;
    expect(err.getAttribute("role")).toBe("alert");
    const retry = err.querySelector("button")!;
    expect(retry.textContent).toContain("Try again");
    expect(document.activeElement).toBe(retry);
    await act(async () => retry.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(f.mock.calls[1][1].body).q).toBe("1HGCM82633A004352");
    expect($("check-card")).not.toBeNull();
  });

  it("rate limit (429) is retryable", async () => {
    vi.stubGlobal(
      "fetch",
      reply(429, { error: "Too many checks. Wait a minute." }),
    );
    act(() => root.render(createElement(CheckAnyListing, {})));
    await submit();
    const retry = $("check-error")?.querySelector("button");
    expect(retry?.textContent).toContain("Try again");
    expect(document.activeElement).toBe(retry);
  });

  it("input error (4xx): message, no retry, focus back on the input", async () => {
    vi.stubGlobal(
      "fetch",
      reply(400, { error: "Add the asking price.", code: "NEED_PRICE" }),
    );
    act(() => root.render(createElement(CheckAnyListing, {})));
    await submit("2018 Civic");
    const err = $("check-error")!;
    expect(err.textContent).toContain("Add the asking price.");
    expect(err.querySelector("button")).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("input"));
  });

  it("loading: one status region and a busy button", async () => {
    let resolve!: (v: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise((r) => (resolve = r))),
    );
    act(() => root.render(createElement(CheckAnyListing, {})));
    await submit();
    expect(
      $("check-loading")?.querySelectorAll('[role="status"]'),
    ).toHaveLength(1);
    expect(
      host.querySelector('button[type="submit"]')?.getAttribute("aria-busy"),
    ).toBe("true");
    await act(async () =>
      resolve({ ok: true, status: 200, json: async () => ({ read: base }) }),
    );
  });

  it("every verdict has its own word and icon; thin-data announcement has no price", () => {
    const words = Object.values(VERDICT).map((v) => v.word);
    const icons = Object.values(VERDICT).map((v) => v.icon);
    expect(new Set(words).size).toBe(words.length);
    expect(new Set(icons).size).toBe(icons.length);
    expect(VERDICT.not_enough_data.word).toBe("Not enough data yet");
    expect(VERDICT.pass.fill).toBe("var(--s2)");
    expect(announceRead(thin)).not.toMatch(/\$/);
  });
});
