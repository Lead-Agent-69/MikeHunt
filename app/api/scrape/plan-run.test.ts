import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runScrapers = vi.hoisted(() => vi.fn(async () => []));

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
        estimatedDealsPerRun: 300,
      },
      {
        id: "govdeals",
        name: "GovDeals",
        type: "auction",
        priority: "high",
        enabled: true,
        requiresAuth: false,
        stealthRequired: false,
        estimatedDealsPerRun: 300,
      },
      {
        id: "curated_dealers",
        name: "Curated dealer network",
        type: "dealer",
        priority: "medium",
        enabled: true,
        requiresAuth: false,
        stealthRequired: true,
        estimatedDealsPerRun: 200,
      },
    ],
  })),
  runScrapers,
}));

vi.mock("@/lib/system-readiness", () => ({
  systemReadiness: vi.fn(() => ({
    ready: true,
    missingEnv: [],
    items: [
      {
        id: "supabase",
        label: "Supabase data API",
        status: "ready",
        nextStep: "Verified.",
        actionLabel: "Connect database",
        verifyPath: "/api/system/status",
      },
      {
        id: "service-role",
        label: "Server write access",
        status: "ready",
        nextStep: "Verified.",
        actionLabel: "Enable server writes",
        verifyPath: "/api/scrape/health",
      },
      {
        id: "scrape-control",
        label: "Scraper control",
        status: "ready",
        nextStep: "Run a scoped import from Scan.",
        actionLabel: "Enable scoped imports",
        verifyPath: "/scan",
      },
    ],
  })),
}));

vi.mock("@/lib/auth/scrape-gate", () => ({
  scrapeSecret: vi.fn(() => "test-secret"),
  denyUnauthed: vi.fn(async () => null),
}));

function req(path: string, body: unknown) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("scrape plan/run source scoping", () => {
  it("plans only matching damaged-lane sources and holds government back", async () => {
    const { POST } = await import("./plan/route");
    const res = await POST(
      req("/api/scrape/plan", {
        scope: { lane: "damaged", vehicleType: "suv", state: "FL" },
        sourceIds: ["govdeals", "copart"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sourceIds).toEqual(["copart"]);
    expect(body.mismatchedSourceIds).toEqual(["govdeals"]);
    expect(body.summary.runnable).toBe(1);
    expect(body.summary.heldBack).toBe(1);
    expect(body.links.proofRankedHref).toContain("/scan?");
    expect(body.links.proofRankedHref).toContain("lane=damaged");
    expect(body.links.proofRankedHref).toContain("state=FL");
    expect(body.links.proofRankedHref).toContain("review=fresh-import");
    expect(body.nextActions.verifySources).toContain("/sources?");
  });

  it("maps named dealer requests to the curated dealer runner", async () => {
    const { POST } = await import("./plan/route");
    const res = await POST(
      req("/api/scrape/plan", {
        scope: { lane: "damaged", vehicleType: "suv", state: "FL" },
        sourceIds: ["ae-of-miami"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sourceIds).toEqual(["curated_dealers"]);
    expect(body.dealerSourceIds).toEqual(["ae-of-miami"]);
    expect(body.mismatchedSourceIds).toEqual([]);
    expect(body.links.scanHref).toContain("dealerSourceIds=ae-of-miami");
    expect(body.links.proofRankedHref).toContain("dealerSourceIds=ae-of-miami");
    expect(body.nextActions.verifySources).toContain(
      "dealerSourceIds=ae-of-miami",
    );
    expect(body.sources[0]).toEqual(
      expect.objectContaining({
        id: "curated_dealers",
        readiness: "needs_run",
        runnable: true,
      }),
    );
    expect(body.sources[0].action).toContain("browser-assisted source search");
  });

  it("preserves make focus in plan links for exact dealer scopes", async () => {
    const { POST } = await import("./plan/route");
    const res = await POST(
      req("/api/scrape/plan", {
        scope: {
          lane: "damaged",
          vehicleType: "suv",
          state: "FL",
          sellerType: "dealer",
          makes: ["Ford", "Toyota"],
          minPrice: 5000,
          maxPrice: 10000,
        },
        sourceIds: ["ae-of-miami"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sourceIds).toEqual(["curated_dealers"]);
    expect(body.dealerSourceIds).toEqual(["ae-of-miami"]);
    expect(body.links.scanHref).toContain("makes=Ford%2CToyota");
    expect(body.links.scanHref).toContain("minPrice=5000");
    expect(body.links.scanHref).toContain("maxPrice=10000");
    expect(body.links.proofRankedHref).toContain("makes=Ford%2CToyota");
    expect(body.links.proofRankedHref).toContain("minPrice=5000");
    expect(body.links.sourceHealthHref).toContain("makes=Ford%2CToyota");
    expect(body.links.sourceHealthHref).toContain("minPrice=5000");
    expect(body.nextActions.verifySources).toContain("makes=Ford%2CToyota");
    expect(body.links.scopeLabel).toContain("over $5,000");
    expect(body.links.scopeLabel).toContain("under $10,000");
    expect(body.links.scopeLabel).toContain("2 make focus");
    expect(body.contract).toMatchObject({
      canImport: true,
      sourceIds: ["curated_dealers"],
      dealerSourceIds: ["ae-of-miami"],
      runnableCount: 1,
      heldBackCount: 0,
    });
    expect(body.contract.allowedFilters).toMatchObject({
      lane: "damaged",
      state: "FL",
      sellerType: "dealer",
      minPrice: 5000,
      maxPrice: 10000,
      makes: ["Ford", "Toyota"],
      dealerSourceIds: ["ae-of-miami"],
    });
    expect(body.contract.proofFields).toEqual(
      expect.arrayContaining([
        "photos",
        "vin",
        "mileage",
        "sellerContact",
        "sourceLink",
        "lastSeen",
      ]),
    );
    expect(body.contract.guardrails.join(" ")).toContain(
      "Hold back mismatched",
    );
  });

  it("maps watched dealer hosts to curated dealer targets in the plan", async () => {
    const { POST } = await import("./plan/route");
    const res = await POST(
      req("/api/scrape/plan", {
        scope: {
          lane: "government",
          dealerHosts: ["aeofmiami.com", "stjamesautoparts.com"],
        },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sourceIds).toEqual(["curated_dealers"]);
    expect(body.dealerSourceIds).toEqual(["ae-of-miami", "stjames-auto"]);
    expect(body.plan.scope.dealerHosts).toEqual([
      "aeofmiami.com",
      "stjamesautoparts.com",
    ]);
  });

  it("refuses a run with no matching sources before reporting import gates", async () => {
    const { POST } = await import("./run/route");
    const res = await POST(
      req("/api/scrape/run", {
        scope: { lane: "damaged", vehicleType: "suv", state: "FL" },
        sourceIds: ["govdeals"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.code).toBe("NO_MATCHING_SOURCES");
    expect(body.sourceIds).toEqual([]);
    expect(body.mismatchedSourceIds).toEqual(["govdeals"]);
    expect(body.contract).toMatchObject({
      canImport: false,
      sourceIds: [],
      runnableCount: 0,
      heldBackSourceIds: ["govdeals"],
    });
  });

  it("passes named dealer targets into the scoped curated dealer run", async () => {
    runScrapers.mockClear();
    runScrapers.mockResolvedValueOnce([
      {
        source: "curated_dealers",
        success: true,
        dealsFound: 3,
        duration: 1200,
      },
    ] as any);
    const { POST } = await import("./run/route");
    const res = await POST(
      req("/api/scrape/run", {
        scope: { lane: "damaged", vehicleType: "suv", state: "FL" },
        sourceIds: ["ae-of-miami"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dealerSourceIds).toEqual(["ae-of-miami"]);
    expect(body.links.scopeLabel).toContain("damaged");
    expect(body.links.scopeLabel).toContain("1 selected dealer");
    expect(body.contract.scopeLabel).toContain("1 selected dealer");
    expect(body.nextActions.reviewFreshRows).toContain(
      "dealerSourceIds=ae-of-miami",
    );
    expect(body.nextActions.verifySources).toContain(
      "dealerSourceIds=ae-of-miami",
    );
    expect(runScrapers).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ["curated_dealers"],
        scope: expect.objectContaining({
          lane: "damaged",
          q: "suv",
          state: "FL",
          dealerSourceIds: ["ae-of-miami"],
        }),
      }),
    );
  });

  it("passes make focus into the scoped curated dealer run", async () => {
    runScrapers.mockClear();
    runScrapers.mockResolvedValueOnce([
      {
        source: "curated_dealers",
        success: true,
        dealsFound: 3,
        duration: 1200,
      },
    ] as any);
    const { POST } = await import("./run/route");
    const res = await POST(
      req("/api/scrape/run", {
        scope: {
          lane: "damaged",
          vehicleType: "suv",
          state: "FL",
          sellerType: "dealer",
          makes: ["Ford", "Toyota"],
          minPrice: 5000,
          maxPrice: 10000,
        },
        sourceIds: ["ae-of-miami"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dealerSourceIds).toEqual(["ae-of-miami"]);
    expect(body.links.scopeLabel).toContain("2 make focus");
    expect(body.links.scopeLabel).toContain("1 selected dealer");
    expect(body.contract.allowedFilters).toMatchObject({
      lane: "damaged",
      state: "FL",
      sellerType: "dealer",
      minPrice: 5000,
      maxPrice: 10000,
      makes: ["Ford", "Toyota"],
      dealerSourceIds: ["ae-of-miami"],
    });
    expect(body.contract.expectedUserPath.at(-1)).toMatchObject({
      label: "Review proof-ranked rows",
    });
    expect(body.nextActions.reviewFreshRows).toContain("makes=Ford%2CToyota");
    expect(body.nextActions.reviewFreshRows).toContain("minPrice=5000");
    expect(body.nextActions.verifySources).toContain("minPrice=5000");
    expect(body.nextActions.verifySources).toContain("makes=Ford%2CToyota");
    expect(runScrapers).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ["curated_dealers"],
        scope: expect.objectContaining({
          lane: "damaged",
          q: "suv",
          state: "FL",
          sellerType: "dealer",
          makes: ["Ford", "Toyota"],
          minPrice: 5000,
          maxPrice: 10000,
          dealerSourceIds: ["ae-of-miami"],
        }),
      }),
    );
  });

  it("passes watched dealer hosts into the scoped curated dealer run", async () => {
    runScrapers.mockClear();
    runScrapers.mockResolvedValueOnce([
      {
        source: "curated_dealers",
        success: true,
        dealsFound: 5,
        duration: 900,
      },
    ] as any);
    const { POST } = await import("./run/route");
    const res = await POST(
      req("/api/scrape/run", {
        scope: {
          lane: "government",
          dealerHosts: ["aeofmiami.com", "stjamesautoparts.com"],
        },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.dealerSourceIds).toEqual(["ae-of-miami", "stjames-auto"]);
    expect(body.links.scopeLabel).toContain("2 selected dealers");
    expect(body.contract.scopeLabel).toContain("2 selected dealers");
    expect(runScrapers).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceIds: ["curated_dealers"],
        scope: expect.objectContaining({
          lane: "government",
          dealerSourceIds: ["ae-of-miami", "stjames-auto"],
        }),
      }),
    );
  });
});
