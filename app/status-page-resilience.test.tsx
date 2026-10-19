import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  system: {} as Record<string, any>,
  health: {} as Record<string, any>,
  fetchers: new Map<string, (url: string) => Promise<any>>(),
}));

vi.mock("swr", () => ({
  default: (key: string, fetcher: (url: string) => Promise<any>) => {
    state.fetchers.set(key, fetcher);
    return {
      ...(key === "/api/system/status" ? state.system : state.health),
      mutate: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

import StatusPage from "./(dashboard)/status/page";

function systemSnapshot() {
  return {
    configured: true,
    freshness: {
      activeDeals: 35_755,
      newLast24h: 912,
      stale: false,
    },
    quality: {
      imagePct: 100,
      sourceLinkPct: 100,
      pricePct: 75,
      damagePct: 99,
      titlePct: 100,
      mileagePct: 77,
      sellerPct: 100,
      sellerContactPct: 91,
      auctionDatePct: 9,
      vinPct: 86,
      detailCoverage: { total: 5_000 },
    },
    sourceHealth: {
      readySources: 1,
      needsLoginSources: 0,
      blockedSources: 0,
      activeRows: 214,
      rowsWithPhotos: 214,
    },
    sources: [
      {
        id: "dg-auto",
        source: "dg-auto",
        name: "D&G Auto",
        type: "dealer",
        priority: 1,
        readiness: "ready",
        activeRows: 214,
        rowsWithPhotos: 214,
        averageQuality: 90,
      },
    ],
    sourceBreakdown: [],
    recentRuns: [],
    readiness: { ready: true, items: [], summary: {} },
    knowledgeBase: {},
    learning: { outcomesLogged: 0, prioritizedMakes: [] },
  };
}

beforeEach(() => {
  state.system = {
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
  };
  state.health = {
    data: undefined,
    error: undefined,
    isLoading: false,
    isValidating: false,
  };
  state.fetchers.clear();
});

afterEach(() => vi.unstubAllGlobals());

describe("status page resilience", () => {
  it("shows a useful loading state without claiming zero inventory", () => {
    state.system.isLoading = true;
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain(
      "Checking stored inventory, freshness, and source proof…",
    );
    expect(html).not.toContain("No source is ready to show inventory yet");
  });

  it("turns a failed first read into a retryable error", () => {
    state.system.error = new Error("offline");
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("System status did not load");
    expect(html).toContain("Try again");
    expect(html).not.toContain("Active deals");
  });

  it("keeps the system snapshot visible when source proof cannot refresh", () => {
    state.system.data = systemSnapshot();
    state.health.error = new Error("offline");
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("35,755");
    expect(html).toContain("Source-level proof could not refresh");
    expect(html).toContain("Rows in source proof");
    expect(html).toContain("Inventory quality sample");
    expect(html).toContain("5,000 active rows");
    expect(html).not.toContain("No source is ready to show inventory yet");
  });

  it("rejects HTTP failures before they can render as successful zeroes", async () => {
    renderToStaticMarkup(<StatusPage />);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: "temporary" }), { status: 503 }),
        ),
    );

    await expect(
      state.fetchers.get("/api/system/status")?.("/api/system/status"),
    ).rejects.toThrow("Status data is temporarily unavailable");
  });
});
