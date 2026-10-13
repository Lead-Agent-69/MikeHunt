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
