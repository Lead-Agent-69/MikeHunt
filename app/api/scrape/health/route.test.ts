import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { DEALER_SOURCE_DOMAINS } from "@/lib/sources/source-meta";

const dependencyMocks = vi.hoisted(() => ({
  isSupabaseConfigured: vi.fn(() => false),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: dependencyMocks.isSupabaseConfigured,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: dependencyMocks.createClient,
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

// These suites pin the terms-safe gate itself. Since 2026-10-09 the default restores the
// operator's sources (OPERATOR_RESTORED_SOURCES / OPERATOR_RESTORED_HOSTS); the gate still runs
// whenever SCRAPE_TERMS_SAFE_ONLY=1, which is what these tests exercise.
beforeEach(() => {
  vi.stubEnv("SCRAPE_TERMS_SAFE_ONLY", "1");
  dependencyMocks.isSupabaseConfigured.mockReturnValue(false);
  dependencyMocks.createClient.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it("describes stored rows that need refresh without claiming no inventory", async () => {
    const { enrichHealthRow } = await import("./route");
    const row = enrichHealthRow(
      {
        id: "cars_com",
        name: "Cars.com",
        type: "dealer",
        enabled: true,
        requiresAuth: false,
      },
      {
        readiness: "needs_run",
        activeRows: 61,
        rowsWithPhotos: 61,
        averageQuality: 100,
        completeness: {
          vinPct: 100,
          mileagePct: 100,
          auctionDatePct: 0,
          sellerPct: 100,
          sellerContactPct: 100,
          sourceLinkPct: 100,
          photosPct: 100,
        },
        lastSeenAt: "2026-10-11T00:03:29.377Z",
      },
      true,
    );

    expect(row).toMatchObject({
      readiness: "needs_run",
      userStatus: "Stored rows need refresh",
      proofLevel: "stale_rows",
      activeRows: 61,
    });
    expect(row.userImpact).toContain("61 stored rows are on file");
    expect(row.nextAction).toBe(
      "Refresh Cars.com before treating these rows as current.",
    );
    expect(row.proofSummary).toBe(row.userImpact);
    expect(row.proofSummary).not.toMatch(/no matching inventory/i);
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
    expect(status.scopeLabel).toContain("from $5,000");
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
        expect(row.nextAction).toContain("written source permission");
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
    expect(body.scopeStatus.scopeLabel).toContain("from $5,000");
    expect(body.scopeStatus.scopeLabel).toContain("up to $10,000");
    expect(body.scopeStatus.scopeLabel).toContain("salvage title");
    expect(body.plan.scope.minPrice).toBe(5000);
    expect(body.plan.scope.maxPrice).toBe(10000);
    expect(body.plan.filters.minPrice).toBe(5000);
    expect(body.plan.filters.maxPrice).toBe(10000);
  });

  it("preserves selected shared-importer dealers without claiming live inventory", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req("/api/scrape/health?lane=damaged&state=MO&dealerSourceIds=autovada"),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.scope.dealerSourceIds).toEqual(["autovada"]);
    expect(body.sources.map((source: any) => source.id)).toEqual(["autovada"]);
    expect(body.sources[0].activeRows).toBe(0);
    expect(body.sources[0].enabled).toBe(false);
  });

  it("keeps every accepted dealer domain in all-dealers health queries", async () => {
    const { scopedDealerUrlNeedles } = await import("./route");
    const ids = Object.keys(DEALER_SOURCE_DOMAINS);
    const needles = scopedDealerUrlNeedles({ dealerSourceIds: ids });
    expect(needles).toEqual(
      Array.from(new Set(Object.values(DEALER_SOURCE_DOMAINS).flat())),
    );
    expect(needles).toContain("replicaautosales.net");
    expect(needles).toContain("autovada.com");
    expect(needles).toContain("garysautoia.net");
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

  it("counts Craigslist dealer-channel inventory under the runner that collected it", async () => {
    const { dbSourceValues, healthSourceIdForDeal } = await import("./route");
    expect(dbSourceValues("craigslist")).toEqual([
      "craigslist",
      "craigslist_dealer",
    ]);
    expect(
      healthSourceIdForDeal({ source: "craigslist_dealer" }, ["craigslist"]),
    ).toBe("craigslist");
    for (const id of Object.keys(DEALER_SOURCE_DOMAINS)) {
      expect(dbSourceValues(id)).toEqual(["independent_dealer"]);
    }
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
    expect(body.plan.sourceIds).toEqual([
      "curated_dealers",
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "carvana",
      "craigslist",
    ]);
    expect(body.plan.reasons).toContain("dealer seller type");
    expect(body.scopeStatus).toMatchObject({
      status: "empty",
      label: "No ready rows yet",
    });
    expect(body.sources.map((source: any) => source.id)).toEqual([
      "curated_dealers",
      "cars_com",
      "cargurus",
      "autotrader",
      "truecar",
      "carvana",
      "craigslist",
      "stjames-auto",
      "dg-auto",
      "recar",
      "ae-of-miami",
      "damage-com",
      "cas-miami",
      "salvagezone",
    ]);
    expect(
      body.sources.every((source: any) =>
        ["dealer", "marketplace"].includes(source.type),
      ),
    ).toBe(true);
    expect(body.summary).toMatchObject({
      total: 14,
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
    expect(source).toContain("sourceProofReadiness({");
    expect(source).toContain("lastRunStatus: lastRun?.status");
    expect(source).toContain("minutesSinceLastRun == null");
    expect(source).toContain(
      'lastRun?.status || (proof?.activeRows ? "observed" : "never_run")',
    );
  });
});

describe("buildLiveCoverage (Decision guide 'working markets')", () => {
  it("counts distinct seller sites and states with live rows, not scraper ids", async () => {
    const { buildLiveCoverage } = await import("./route");
    const c = buildLiveCoverage([
      {
        source: "independent_dealer",
        source_url: "https://www.alanjay.com/a",
        location_state: "FL",
      },
      {
        source: "independent_dealer",
        source_url: "https://alanjay.com/b",
        location_state: "FL",
      },
      {
        source: "independent_dealer",
        source_url: "https://economynj.com/c",
        location_state: "NJ",
      },
      {
        source: "copart",
        source_url: "https://www.copart.com/lot/1",
        location_state: "tx",
      },
      {
        source: "gov_auction",
        source_url: "https://www.govdeals.com/x",
        location_state: null,
      },
    ]);
    expect(c).toMatchObject({
      liveRows: 5,
      workingMarkets: 4,
      liveSites: 4,
      liveStates: 3,
      liveSourceGroups: 3,
    });
    expect(c.topSites[0]).toEqual({ host: "alanjay.com", activeRows: 2 });
  });
});

describe("database inventory health rollups", () => {
  it("uses the compact RPC for unfiltered health without reading deals pages", async () => {
    vi.stubEnv("SCRAPE_SOURCES", "copart");
    dependencyMocks.isSupabaseConfigured.mockReturnValue(true);
    const from = vi.fn((table: string) => {
      if (table === "deals") {
        throw new Error("wide deals fallback should not run");
      }
      if (table !== "scraper_runs")
        throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              limit: async () => ({ data: [], error: null }),
            }),
          }),
        }),
      };
    });
    const rpc = vi.fn(async (name: string) => {
      if (name === "scrape_health_inventory_rollup") {
        return {
          data: [
            {
              source: "copart",
              adapter_id: "",
              source_host: "copart.com",
              location_state: "MO",
              seller_type: "auction",
              active_rows: 2,
              rows_with_photos: 2,
              photos: 2,
              vin: 2,
              title: 2,
              mileage: 2,
              damage: 2,
              price: 2,
              location: 2,
              seller: 2,
              explicit_seller_identity: 0,
              explicit_seller_contact: 0,
              auction_date: 2,
              source_link: 2,
              newest_seen: "2026-10-19T09:00:00.000Z",
            },
          ],
          error: null,
        };
      }
      if (name === "scrape_demand") return { data: [], error: null };
      throw new Error(`unexpected RPC ${name}`);
    });
    dependencyMocks.createClient.mockReturnValue({ from, rpc });

    const { GET } = await import("./route");
    const response = await GET(req("/api/scrape/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inventoryProofMode).toBe("database_rollup");
    expect(body.coverage).toMatchObject({
      liveRows: 2,
      liveSites: 1,
      liveStates: 1,
    });
    expect(
      body.sources.find((source: any) => source.id === "copart"),
    ).toMatchObject({
      activeRows: 2,
      rowsWithPhotos: 2,
      averageQuality: 91,
    });
    expect(from).not.toHaveBeenCalledWith("deals");
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "scrape_health_inventory_rollup",
      "scrape_demand",
    ]);
  });

  it("keeps exact weighted coverage and concrete dealer attribution", async () => {
    const { buildLiveCoverageFromRollups, buildProofFromRollups } =
      await import("./route");
    const [dealerId, domains] = Object.entries(DEALER_SOURCE_DOMAINS).find(
      ([, values]) => values.length > 0,
    )!;
    const rows = [
      {
        source: "independent_dealer",
        adapter_id: "curated_dealers",
        source_host: domains[0],
        location_state: "FL",
        seller_type: "dealer",
        active_rows: "3",
        rows_with_photos: "3",
        photos: "3",
        vin: "3",
        title: "3",
        mileage: "3",
        damage: "3",
        price: "3",
        location: "3",
        seller: "3",
        explicit_seller_identity: "0",
        explicit_seller_contact: "0",
        auction_date: "0",
        source_link: "3",
        newest_seen: "2026-10-19T08:00:00.000Z",
      },
      {
        source: "gov_auction",
        adapter_id: "govdeals",
        source_host: "govdeals.com",
        location_state: "TX",
        seller_type: "auction",
        active_rows: 2,
        rows_with_photos: 2,
        photos: 2,
        vin: 2,
        title: 2,
        mileage: 2,
        damage: 2,
        price: 2,
        location: 2,
        seller: 2,
        explicit_seller_identity: 0,
        explicit_seller_contact: 0,
        auction_date: 0,
        source_link: 2,
        newest_seen: "2026-10-19T09:00:00.000Z",
      },
    ];

    const proof = buildProofFromRollups(rows, [
      dealerId,
      "curated_dealers",
      "govdeals",
    ]);
    expect(proof.attributedDealerRows).toBe(3);
    expect(proof.proofBySource[dealerId]).toMatchObject({
      activeRows: 3,
      rowsWithPhotos: 3,
      qualityPresent: 30,
      qualityChecks: 30,
      lastSeenAt: "2026-10-19T08:00:00.000Z",
    });
    expect(proof.proofBySource[dealerId].completeness).toMatchObject({
      photos: 3,
      sellerContact: 3,
      sourceLink: 3,
    });
    expect(proof.proofBySource.govdeals).toMatchObject({
      activeRows: 2,
      qualityPresent: 18,
      qualityChecks: 22,
    });

    expect(buildLiveCoverageFromRollups(rows)).toMatchObject({
      liveRows: 5,
      workingMarkets: 2,
      liveSites: 2,
      liveStates: 2,
      liveSourceGroups: 2,
      topSites: [
        { host: domains[0], activeRows: 3 },
        { host: "govdeals.com", activeRows: 2 },
      ],
    });
  });

  it("keeps the rollup RPC service-only and security-invoker", () => {
    const migration = readFileSync(
      "supabase/migrations/20261019100510_source_health_rollup.sql",
      "utf8",
    );
    expect(migration).toContain("security invoker");
    expect(migration).not.toContain("security definer");
    expect(migration).toContain(
      "revoke all on function public.scrape_health_inventory_rollup(text[])",
    );
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });
});

describe("healthSourceIdForDeal", () => {
  it("uses persisted adapter proof before a shared government source enum", async () => {
    const { healthSourceIdForDeal } = await import("./route");
    expect(
      healthSourceIdForDeal(
        {
          source: "gov_auction",
          source_url: "https://www.govdeals.com/legacy-url",
          options: { sourceAdapterId: "allsurplus" },
        },
        ["govdeals", "allsurplus"],
      ),
    ).toBe("allsurplus");
  });

  it("recognizes already-stored AutoTempest aggregator attribution", async () => {
    const { healthSourceIdForDeal } = await import("./route");
    expect(
      healthSourceIdForDeal(
        {
          source: "cars_com",
          source_url: "https://www.cars.com/vehicledetail/example",
          options: { aggregator: "autotempest" },
        },
        ["cars_com", "autotempest"],
      ),
    ).toBe("autotempest");
  });

  it("keeps a known dealer host more specific than its shared importer", async () => {
    const { healthSourceIdForDeal } = await import("./route");
    const [dealerId, domains] = Object.entries(DEALER_SOURCE_DOMAINS).find(
      ([, values]) => values.length > 0,
    )!;
    expect(
      healthSourceIdForDeal(
        {
          source: "independent_dealer",
          source_url: `https://${domains[0]}/inventory/1`,
          options: { sourceAdapterId: "curated_dealers" },
        },
        [dealerId, "curated_dealers"],
      ),
    ).toBe(dealerId);
  });
});
