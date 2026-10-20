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
      detailCoverage: { total: 5_000, mode: "bounded_sample" },
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
    readiness: {
      ready: true,
      items: [
        {
          id: "supabase",
          label: "Supabase data API",
          status: "ready",
          detail: "Persistence is configured.",
          nextStep: "Monitor data health.",
        },
        {
          id: "google-login",
          label: "Google login",
          status: "ready",
          detail: "Google login is configured.",
          nextStep: "Retest after OAuth changes.",
        },
        {
          id: "scrape-control",
          label: "Scraper control",
          status: "ready",
          detail: "Scoped source searches are configured.",
          nextStep: "Monitor source health.",
        },
      ],
      summary: {},
    },
    knowledgeBase: {
      dealMathReadyPct: 96,
      soldComps: 0,
      attributedAuctionSales: 486,
    },
    realData: {
      buyerReady: true,
      decisionReady: false,
    },
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

  it("labels the exact customer-visible rollup as proof instead of a sample", () => {
    const snapshot = systemSnapshot();
    snapshot.quality.detailCoverage = {
      total: 1_869,
      mode: "customer_visible_rollup",
    };
    state.system.data = snapshot;
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("Inventory quality proof");
    expect(html).toContain("1,869");
    expect(html).toContain("current, buyer-visible rows");
    expect(html).not.toContain("separate sample of up to");
  });

  it("does not contradict a verified Google login state", () => {
    state.system.data = systemSnapshot();
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("Google login is ready for synced watchlists");
    expect(html).toContain("Remaining trust limits");
    expect(html).not.toContain("Google account creation is not fully proven");
  });

  it("describes configured production capabilities without setup-era copy", () => {
    state.system.data = systemSnapshot();
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("Operating priorities");
    expect(html).toContain("1 source can show stored inventory now");
    expect(html).toContain("Keep account data synchronized");
    expect(html).toContain("synced to the production database");
    expect(html).toContain("Scoped searches are active");
    expect(html).not.toContain("public preview");
    expect(html).not.toContain("database setup is pending");
    expect(html).not.toContain("Once scraper control is authorized");
  });

  it("does not call estimate-only deal math buyer-ready", () => {
    state.system.data = systemSnapshot();
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("Buyer workflow coverage");
    expect(html).toContain("83%");
    expect(html).toContain("workflow coverage");
    expect(html).toContain("evidence pending");
    expect(html).toContain(
      "Completed-sale evidence is still required before treating it as a buy/pass verdict.",
    );
    expect(html).not.toContain("buyer-ready");
  });

  it("marks projected profit proven only with completed-sale decision evidence", () => {
    const snapshot = systemSnapshot();
    snapshot.realData.decisionReady = true;
    snapshot.knowledgeBase.soldComps = 12;
    state.system.data = snapshot;

    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain(
      "96% have deal math backed by completed-sale decision evidence.",
    );
    expect(html).toContain("100%");
    expect(html).not.toContain("evidence pending");
  });

  it("separates retail resale comps from attributed auction outcomes", () => {
    state.system.data = systemSnapshot();
    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("Retail sold comps");
    expect(html).toContain("Auction sale observations");
    expect(html).toContain("486");
    expect(html).toContain(
      "Auction sale observations are real acquisition evidence",
    );
    expect(html).toContain("stay out of retail resale medians");
  });

  it("keeps setup guidance when persistence and scraper control are missing", () => {
    const snapshot = systemSnapshot();
    snapshot.readiness.ready = false;
    snapshot.readiness.items = [
      {
        id: "supabase",
        label: "Supabase data API",
        status: "not_configured",
        detail: "Persistence is not configured.",
        nextStep: "Connect the production database.",
      },
      {
        id: "scrape-control",
        label: "Scraper control",
        status: "not_configured",
        detail: "Scoped source searches are not configured.",
        nextStep: "Authorize scraper control.",
      },
    ];
    state.system.data = snapshot;

    const html = renderToStaticMarkup(<StatusPage />);

    expect(html).toContain("Launch order");
    expect(html).toContain("Connect account persistence");
    expect(html).toContain("Connect the production database");
    expect(html).toContain("Enable scoped source searches");
    expect(html).toContain("Authorize scraper control");
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
