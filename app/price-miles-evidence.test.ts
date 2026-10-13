import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  similar: {} as any,
  sources: {} as any,
  fetcher: null as any,
}));
vi.mock("swr", () => ({
  default: (key: string, fetcher: any) => {
    state.fetcher = fetcher;
    return {
      ...(key.endsWith("/similar") ? state.similar : state.sources),
      mutate: vi.fn(),
    };
  },
}));
import { PriceMilesScatter } from "@/components/deal/PriceMilesScatter";
const render = () =>
  renderToStaticMarkup(
    React.createElement(PriceMilesScatter, {
      dealId: "one",
      askPrice: 500,
      mileage: 50000,
    }),
  );
const comps = () =>
  Array.from({ length: 4 }, (_, i) => ({
    mileage: 30000 + i * 10000,
    askPrice: 300,
    priceContext: {
      cashPrice: 18000 - i * 1000,
      canCompareToAskingCurve: true,
    },
  }));
beforeEach(() => {
  state.similar = { data: { similar: comps() } };
  state.sources = {
    data: {
      base: {
        mileage: 50000,
        cashPrice: 15000,
        canCompareToAskingCurve: true,
      },
    },
  };
  vi.unstubAllGlobals();
});
it("uses eligible full asking prices and never calls the result a better buy", () => {
  const html = render();
  expect(html).toContain("4 comparable asking prices");
  expect(html).toContain("Not completed sales or a purchase recommendation");
  expect(html).toContain("Asking-price trend");
  expect(html).not.toMatch(/better buy|Market expects|\$300|\$500/);
});
it("does not plot bids/payment amounts or use this car to fill missing comps", () => {
  state.similar.data.similar = comps().map((c) => ({
    ...c,
    priceContext: { cashPrice: 500, canCompareToAskingCurve: false },
  }));
  expect(render()).toContain("Not enough comparable asking prices");
  state.similar.data.similar = comps().slice(0, 3);
  expect(render()).not.toContain(
    'aria-label="Comparable asking prices by mileage"',
  );
});
it("does not grade outside the observed mileage range", () => {
  state.sources.data.base.mileage = 100000;
  expect(render()).not.toMatch(
    /under the curve|at\/above the curve|Asking-price trend/,
  );
});
it("shows an outage instead of an empty-comps claim", () => {
  state.similar = { error: new Error("offline") };
  expect(render()).toContain("Price comparison unavailable");
  expect(render()).not.toContain("Not enough comparable");
});
it("rejects failed HTTP responses", async () => {
  render();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(state.fetcher("/api/test")).rejects.toThrow(
    "Price comparison unavailable",
  );
});
it("distinguishes loading from insufficient evidence", () => {
  state.similar = { isLoading: true };
  expect(render()).toContain("Loading price comparisons");
  expect(render()).not.toContain("Not enough comparable");
});
it("excludes the current vehicle if it is repeated in the response", () => {
  state.similar.data.similar = comps().map((c, i) => ({
    ...c,
    id: i === 0 ? "one" : `other-${i}`,
  }));
  expect(render()).not.toContain(
    'aria-label="Comparable asking prices by mileage"',
  );
});
it("keeps legacy advertised amounts usable without a cash-price or buy claim", () => {
  state.similar.data.similar = comps().map((c) => ({
    ...c,
    priceContext: {
      kind: "unknown",
      amount: 10000,
      advertisedAmount: 10000,
      observationCurrent: true,
      canCompareToAskingCurve: false,
      cashPrice: null,
    },
  }));
  state.sources.data.base = {
    mileage: 50000,
    cashPrice: null,
    canCompareToAskingCurve: false,
    priceContext: {
      kind: "unknown",
      advertisedAmount: 9000,
      observationCurrent: true,
    },
  };
  const html = render();
  expect(html).toContain("4 advertised listing amounts");
  expect(html).toContain('aria-label="Advertised amounts by mileage"');
  expect(html).not.toMatch(
    /under the curve|at\/above the curve|Asking-price trend|better buy/,
  );
});
