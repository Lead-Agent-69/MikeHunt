import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/auth/scrape-gate", () => ({
  canSeeScrapeDetail: vi.fn(async () => false),
}));

vi.mock("@/lib/scrapers/runner", () => ({
  createScraperRegistry: vi.fn(() => ({
    getAll: () => [
      {
        id: "copart",
        name: "Copart",
        type: "auction",
        priority: "high",
        enabled: true,
        requiresAuth: false,
        stealthRequired: false,
        frequencyMinutes: 360,
        estimatedDealsPerRun: 300,
      },
      {
        id: "iaa",
        name: "IAA",
        type: "auction",
        priority: "high",
        enabled: false,
        requiresAuth: true,
        stealthRequired: true,
        frequencyMinutes: 60,
        estimatedDealsPerRun: 150,
      },
      {
        id: "curated_dealers",
        name: "Curated dealer network",
        type: "dealer",
        priority: "medium",
        enabled: true,
        requiresAuth: false,
        stealthRequired: true,
        frequencyMinutes: 720,
        estimatedDealsPerRun: 200,
      },
      {
        id: "govdeals",
        name: "GovDeals",
        type: "auction",
        priority: "high",
        enabled: true,
        requiresAuth: false,
        stealthRequired: false,
        frequencyMinutes: 360,
        estimatedDealsPerRun: 300,
      },
      {
        id: "publicsurplus",
        name: "PublicSurplus",
        type: "auction",
        priority: "high",
        enabled: true,
        requiresAuth: false,
        stealthRequired: false,
        frequencyMinutes: 360,
        estimatedDealsPerRun: 130,
      },
      {
        id: "municibid",
        name: "Municibid",
        type: "auction",
        priority: "high",
        enabled: true,
        requiresAuth: false,
        stealthRequired: false,
        frequencyMinutes: 360,
        estimatedDealsPerRun: 100,
      },
      {
        id: "gsa_auctions",
        name: "GSA Auctions",
        type: "auction",
        priority: "high",
        enabled: true,
        requiresAuth: false,
        stealthRequired: false,
        frequencyMinutes: 360,
        estimatedDealsPerRun: 70,
      },
      {
        id: "allsurplus",
        name: "AllSurplus",
        type: "auction",
        priority: "medium",
        enabled: true,
        requiresAuth: false,
        stealthRequired: false,
        frequencyMinutes: 360,
        estimatedDealsPerRun: 150,
      },
    ],
  })),
}));

const previewGovDeals = vi.fn(async () => [
  {
    title: "2019 Mercedes-Benz C-Class",
    ask_price: 9990,
    location_state: "FL",
    images: ["https://example.com/gov.jpg"],
    source_url: "https://govdeals.example/1",
  },
]);

const previewPublicSurplus = vi.fn(async () => []);
const previewMunicibid = vi.fn(async () => []);

vi.mock("@/lib/scrapers/sources/govdeals", () => ({
  previewGovDeals,
}));

vi.mock("@/lib/scrapers/sources/publicsurplus", () => ({
  previewPublicSurplus,
}));

vi.mock("@/lib/scrapers/sources/municibid", () => ({
  previewMunicibid,
}));

function req(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("GET /api/scrape/health lane scoping", () => {
  it("enriches ready rows with buyer-facing proof and weak-field guidance", async () => {
    const { enrichHealthRow } = await import("./route");
    const row = enrichHealthRow(
      {
        id: "ae-of-miami",
        name: "AE of Miami",
        type: "dealer",
        enabled: true,
        requiresAuth: false,
      },
      {
        readiness: "ready",
        activeRows: 3,
        rowsWithPhotos: 3,
        averageQuality: 64,
        completeness: {
          vinPct: 0,
          mileagePct: 0,
          auctionDatePct: 0,
          sellerPct: 100,
          sellerContactPct: 100,
          sourceLinkPct: 100,
          photosPct: 100,
        },
        lastSeenAt: new Date().toISOString(),
      },
      true,
      {
        lane: "damaged",
        state: "FL",
        titleType: "salvage",
        sellerType: "dealer",
      },
    );

    expect(row).toMatchObject({
      userStatus: "Seen just now",
      proofLevel: "stored_rows",
      photoCoveragePct: 100,
      qualityLabel: "Thin",
      freshnessHours: 0,
    });
    expect(row.userStatus).not.toBe("Working");
    expect(row.userImpact).not.toMatch(/live inventory/i);
    expect(row.nextAction).not.toMatch(/^Working/);
    expect(row.proofBadges).toEqual(
      expect.arrayContaining([
        "3 rows",
        "3 photos",
        "100% photo coverage",
        "64/100 detail",
      ]),
    );
    expect(row.proofSummary).toContain(
      "AE of Miami returned 3 active rows with 3 photo-backed rows",
    );
    expect(row.nextAction).toContain("verify weak fields");
    expect(row.nextAction).toContain("Listings on file");
  });

  it("labels older ready rows by last-seen age instead of a live scrape", async () => {
    const { enrichHealthRow } = await import("./route");
    const row = enrichHealthRow(
      {
        id: "ae-of-miami",
        name: "AE of Miami",
        type: "dealer",
        enabled: true,
        requiresAuth: false,
      },
      {
        readiness: "ready",
        activeRows: 3,
        rowsWithPhotos: 3,
        averageQuality: 90,
        completeness: {
          vinPct: 100,
          mileagePct: 100,
          auctionDatePct: 100,
          sellerPct: 100,
          sellerContactPct: 100,
          sourceLinkPct: 100,
          photosPct: 100,
        },
        lastSeenAt: new Date(Date.now() - 5 * 3600_000).toISOString(),
      },
      true,
    );

    expect(row.userStatus).toBe("Seen 5h ago");
    expect(row.proofLevel).toBe("stored_rows");
    expect(row.userImpact).toMatch(/not a live scrape/i);
    expect(row.nextAction).toMatch(/not a live scrape/i);
    expect(row.proofBadges).toContain("Seen 5h ago");
  });

  it("turns empty scoped proof into a clear buyer next action", async () => {
    const { buildScopeStatus } = await import("./route");
    const status = buildScopeStatus({
      scope: {
        lane: "damaged",
        state: "FL",
        q: "suv",
        sellerType: "dealer",
        titleType: "salvage",
        minPrice: 5000,
      },
      scopeFiltered: true,
      plan: {
        scope: { lane: "damaged" },
        sourceIds: ["curated_dealers"],
        reasons: [],
        filters: {},
      } as any,
      health: [
        {
          id: "ae-of-miami",
          readiness: "no_rows",
        },
      ],
    });

    expect(status).toMatchObject({
      status: "empty",
      label: "No ready rows yet",
    });
    expect(status.scopeLabel).toContain("damaged lane");
    expect(status.scopeLabel).toContain("salvage title");
    expect(status.scopeLabel).toContain("FL");
    expect(status.scopeLabel).toContain("over $5,000");
    expect(status.nextAction).toContain("run the matching sources");
  });

  it("limits government health proof to government sources", async () => {
    // GovDeals is terms-restricted; this proof path runs with the operator opt-in.
    const prior = process.env.SCRAPE_SOURCES;
    process.env.SCRAPE_SOURCES = "govdeals";
    try {
      const { GET } = await import("./route");
      const res = await GET(
        req(
          "/api/scrape/health?lane=government&state=FL&maxPrice=10000&q=mercedes",
        ),
      );
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.scope).toMatchObject({ lane: "government", state: "FL" });
      expect(body.plan.sourceIds).toEqual([
        "publicsurplus",
        "govdeals",
        "allsurplus",
        "municibid",
        "gsa_auctions",
      ]);
      expect(body.sources.map((source: any) => source.id)).toEqual(
        body.plan.sourceIds,
      );
      expect(
        body.sources.find((source: any) => source.id === "govdeals"),
      ).toMatchObject({
        readiness: "ready",
        activeRows: 1,
        rowsWithPhotos: 1,
      });
      expect(body.summary).toMatchObject({
        total: 5,
        enabled: 5,
        healthy: 1,
        ready: 1,
        activeRows: 1,
        rowsWithPhotos: 1,
        photoCoveragePct: 100,
        termsOff: 3,
      });
      expect(body.healthy).toBe(1);
    } finally {
      if (prior === undefined) delete process.env.SCRAPE_SOURCES;
      else process.env.SCRAPE_SOURCES = prior;
    }
  });

  it("labels terms-restricted sources off for site terms and never probes them", async () => {
    const prior = process.env.SCRAPE_SOURCES;
    delete process.env.SCRAPE_SOURCES;
    previewPublicSurplus.mockClear();
    previewMunicibid.mockClear();
    try {
      const { GET } = await import("./route");
      const res = await GET(req("/api/scrape/health?lane=government&state=FL"));
      const body = await res.json();
      expect(res.status).toBe(200);
      for (const id of [
        "publicsurplus",
        "municibid",
        "govdeals",
        "allsurplus",
      ]) {
        const row = body.sources.find((source: any) => source.id === id);
        expect(row).toMatchObject({
          readiness: "disabled",
          termsRestricted: true,
          userStatus: "Off for site terms",
          proofLevel: "off",
          isDue: false,
        });
        expect(row.termsReason).toMatch(/automat|robot/i);
        expect(row.nextAction).toContain("SCRAPE_SOURCES");
        expect(row.userStatus).not.toBe("Needs run");
      }
      expect(
        body.sources.find((source: any) => source.id === "gsa_auctions"),
      ).not.toHaveProperty("termsRestricted");
      expect(previewPublicSurplus).not.toHaveBeenCalled();
      expect(previewMunicibid).not.toHaveBeenCalled();
    } finally {
      if (prior === undefined) delete process.env.SCRAPE_SOURCES;
      else process.env.SCRAPE_SOURCES = prior;
    }
  });

  it("an explicit SCRAPE_SOURCES opt-in lifts the terms label", async () => {
    const prior = process.env.SCRAPE_SOURCES;
    process.env.SCRAPE_SOURCES = "municibid";
    previewMunicibid.mockClear();
    try {
      const { GET } = await import("./route");
      const res = await GET(req("/api/scrape/health?lane=government&state=FL"));
      const body = await res.json();
      const row = body.sources.find((source: any) => source.id === "municibid");
      expect(row).not.toHaveProperty("termsRestricted");
      expect(row.readiness).not.toBe("disabled");
      expect(previewMunicibid).toHaveBeenCalled();
    } finally {
      if (prior === undefined) delete process.env.SCRAPE_SOURCES;
      else process.env.SCRAPE_SOURCES = prior;
    }
  });

  it("does not run public government probes for damaged-lane health", async () => {
    previewGovDeals.mockClear();
    previewPublicSurplus.mockClear();
    previewMunicibid.mockClear();
    const { GET } = await import("./route");
    const res = await GET(
      req("/api/scrape/health?lane=damaged&state=FL&maxPrice=10000&q=suv"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope).toMatchObject({ lane: "damaged", state: "FL" });
    expect(body.sources.map((source: any) => source.id)).toEqual([
      "copart",
      "iaa",
      "curated_dealers",
      "stjames-auto",
      "dg-auto",
      "recar",
      "ae-of-miami",
      "damage-com",
      "cas-miami",
      "salvagezone",
    ]);
    expect(
      body.sources.find((source: any) => source.id === "ae-of-miami"),
    ).toMatchObject({
      name: "AE of Miami",
      readiness: "not_configured",
      activeRows: 0,
      rowsWithPhotos: 0,
      proofSummary:
        "This source is known, but matching rows cannot be saved until Supabase is connected.",
    });
    expect(previewGovDeals).not.toHaveBeenCalled();
    expect(previewPublicSurplus).not.toHaveBeenCalled();
    expect(previewMunicibid).not.toHaveBeenCalled();
  });

  it("carries min price through scoped source proof", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/scrape/health?lane=damaged&state=FL&titleType=salvage&minPrice=5000&maxPrice=10000",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope).toMatchObject({
      lane: "damaged",
      state: "FL",
      titleType: "salvage",
      minPrice: 5000,
      maxPrice: 10000,
    });
    expect(body.scopeStatus.scopeLabel).toContain("over $5,000");
    expect(body.scopeStatus.scopeLabel).toContain("under $10,000");
    expect(body.scopeStatus.scopeLabel).toContain("salvage title");
    expect(body.plan.scope.minPrice).toBe(5000);
    expect(body.plan.scope.maxPrice).toBe(10000);
    expect(body.plan.filters.minPrice).toBe(5000);
    expect(body.plan.filters.maxPrice).toBe(10000);
  });

  it("limits dealer proof to selected dealer hosts", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/scrape/health?lane=private&dealers=aeofmiami.com,stjamesautoparts.com",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope.dealerHosts).toEqual([
      "aeofmiami.com",
      "stjamesautoparts.com",
    ]);
    expect(body.plan.sourceIds).toEqual(["curated_dealers"]);
    expect(body.sources.map((source: any) => source.id)).toEqual([
      "stjames-auto",
      "ae-of-miami",
    ]);
    expect(body.sources[0].proofBadges).toEqual(
      expect.arrayContaining(["0 rows", "0 photos"]),
    );
  });

  it("limits dealer proof to selected dealer source ids", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req("/api/scrape/health?sellerType=dealer&source=ae-of-miami"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope).toMatchObject({
      sellerType: "dealer",
      dealerSourceIds: ["ae-of-miami"],
    });
    expect(body.plan.sourceIds).toEqual(["curated_dealers"]);
    expect(body.sources.map((source: any) => source.id)).toEqual([
      "ae-of-miami",
    ]);
    expect(body.scopeStatus.scopeLabel).toContain("1 selected dealer");
  });

  it("limits seller-type dealer health to dealer sources", async () => {
    const { GET } = await import("./route");
    const res = await GET(req("/api/scrape/health?sellerType=dealer"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope).toMatchObject({ sellerType: "dealer" });
    expect(body.plan.sourceIds).toEqual(["curated_dealers"]);
    expect(body.plan.reasons).toContain("dealer seller type");
    expect(body.scopeStatus).toMatchObject({
      status: "empty",
      label: "No ready rows yet",
    });
    expect(body.sources.map((source: any) => source.id)).toEqual([
      "curated_dealers",
      "stjames-auto",
      "dg-auto",
      "recar",
      "ae-of-miami",
      "damage-com",
      "cas-miami",
      "salvagezone",
    ]);
    expect(body.sources.every((source: any) => source.type === "dealer")).toBe(
      true,
    );
    expect(body.summary).toMatchObject({
      total: 8,
      healthy: 0,
      activeRows: 0,
      rowsWithPhotos: 0,
      photoCoveragePct: 0,
    });
  });

  it("returns no sources when lane and seller type cannot safely intersect", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req("/api/scrape/health?lane=government&sellerType=dealer"),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.scope).toMatchObject({
      lane: "government",
      sellerType: "dealer",
    });
    expect(body.plan.sourceIds).toEqual([]);
    expect(body.scopeStatus).toMatchObject({
      status: "no_match",
      label: "No safe source match",
    });
    expect(body.scopeStatus.message).toContain("held back");
    expect(body.sources).toEqual([]);
    expect(body.total).toBe(0);
    expect(body.healthy).toBe(0);
    expect(body.summary).toMatchObject({
      total: 0,
      healthy: 0,
      activeRows: 0,
      rowsWithPhotos: 0,
    });
  });

  it("selects make/model fields before applying scoped make proof filters", () => {
    const source = readFileSync(
      __filename.replace(/\.test\.ts$/, ".ts"),
      "utf8",
    );

    expect(source).toContain("year, make, model, trim");
    expect(source).toContain("scope.makes?.length");
  });

  it("does not let shared curated dealer runs mask stale selected-dealer proof", () => {
    const source = readFileSync(
      __filename.replace(/\.test\.ts$/, ".ts"),
      "utf8",
    );

    expect(source).toContain("source.catalogUrl && !proof?.activeRows");
    expect(source).toContain(
      "lastRun?.completed_at || lastRun?.started_at || proof?.lastSeenAt",
    );
    expect(source).toContain('lastRun?.status === "error"');
    expect(source).toContain("minutesSinceLastRun == null");
    expect(source).toContain(
      'lastRun?.status || (proof?.activeRows ? "observed" : "never_run")',
    );
  });
});
