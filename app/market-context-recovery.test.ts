import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const swr = vi.hoisted(() => ({
  sources: {} as any,
  auxiliary: {} as any,
  fetcher: null as any,
}));
vi.mock("swr", () => ({
  default: (key: string | null, fetcher: unknown) => {
    swr.fetcher = fetcher;
    return {
      ...(key?.includes("/sources") ? swr.sources : swr.auxiliary),
      mutate: vi.fn(),
    };
  },
}));
import { MarketContext } from "@/components/deal/MarketContext";
const render = () =>
  renderToStaticMarkup(React.createElement(MarketContext, { dealId: "one" }));
beforeEach(() => {
  swr.sources = {};
  swr.auxiliary = {};
  vi.unstubAllGlobals();
});
it("distinguishes loading, unavailable and insufficient evidence", () => {
  swr.sources = { isLoading: true };
  expect(render()).toContain("Loading market evidence");
  swr.sources = { error: new Error("offline") };
  expect(render()).toContain("Market evidence unavailable");
  swr.sources = { data: { base: { make: "Honda", model: "Civic" } } };
  expect(render()).toContain("Not enough market observations");
});
it("shows partial failures without discarding available source evidence", () => {
  swr.sources = {
    data: {
      base: { make: "Honda", model: "Civic" },
      sources: [
        {
          id: "a",
          source: "copart",
          askPrice: 500,
          url: "https://example.com/a",
        },
        { id: "b", source: "carvana", askPrice: 0, url: null },
        {
          id: "c",
          source: "craigslist",
          askPrice: 12000,
          url: "javascript:alert(1)",
        },
      ],
    },
  };
  swr.auxiliary = { error: new Error("offline") };
  const html = render();
  expect(html).toContain("Some market evidence unavailable");
  expect(html).toContain("Current bid");
  expect(html).toContain("Not reported");
  expect(html).toContain("Source link unavailable");
  expect(html).not.toContain('href="#"');
  expect(html).not.toContain("javascript:");
  expect(html).not.toContain("spread");
  expect(html).toContain("3 reported listings");
});
it("rejects failed HTTP responses instead of treating them as empty data", async () => {
  render();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await expect(swr.fetcher("/api/test")).rejects.toThrow(
    "Market evidence unavailable",
  );
});

it("does not turn observation age into listing duration or seller motivation", () => {
  swr.sources = {
    data: {
      base: {
        make: "Honda",
        model: "Civic",
        firstSeenAt: new Date(Date.now() - 60 * 86400000).toISOString(),
      },
    },
  };
  const html = render();
  expect(html).toContain("60d since first observed");
  expect(html).not.toMatch(/on market|motivated seller|stale/i);
});

it.each([false, undefined])(
  "does not plot ineligible or legacy amounts: %s",
  (canCompareToAskingCurve) => {
    swr.sources = {
      data: {
        base: {
          make: "Honda",
          model: "Accord",
          mileage: 50000,
          askPrice: 500,
          cashPrice: 500,
          canCompareToAskingCurve,
        },
      },
    };
    swr.auxiliary = {
      data: {
        depreciationPer1000Miles: 100,
        trend: [
          { mileage: 0, price: 20000 },
          { mileage: 100000, price: 10000 },
        ],
      },
    };
    expect(render()).not.toMatch(/% (below|above) the asking-price curve/);
  },
);
it("uses eligible cash price instead of a payment on the curve", () => {
  swr.sources = {
    data: {
      base: {
        make: "Honda",
        model: "Accord",
        mileage: 50000,
        askPrice: 500,
        cashPrice: 12000,
        canCompareToAskingCurve: true,
      },
    },
  };
  swr.auxiliary = {
    data: {
      depreciationPer1000Miles: 100,
      priceBasis: "reported_cash_asking",
      trend: [
        { mileage: 0, price: 20000 },
        { mileage: 100000, price: 10000 },
      ],
    },
  };
  expect(render()).toContain("20% below the asking-price curve");
});
it("labels payment terms for a single reported listing", () => {
  swr.sources = {
    data: {
      base: { make: "Honda", model: "Accord" },
      sources: [
        {
          id: "payment",
          source: "independent_dealer",
          askPrice: 500,
          priceContext: {
            kind: "down_payment",
            label: "Possible down payment",
            advertisedAmount: 500,
          },
          url: null,
        },
      ],
    },
  };
  const html = render();
  expect(html).toContain("Possible down payment");
  expect(html).toContain("1 reported listing");
  expect(html).not.toContain("Reported asking / buy-now range");
});
