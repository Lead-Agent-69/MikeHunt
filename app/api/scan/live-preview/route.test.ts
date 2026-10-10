import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { previewCopartLots } from "@/lib/scrapers/sources/copart";
import { previewGovDeals } from "@/lib/scrapers/sources/govdeals";
import { previewMunicibid } from "@/lib/scrapers/sources/municibid";

vi.mock("@/lib/deals/deal-desk-access", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/deals/deal-desk-access")>();
  return { ...actual, resolveCallerDesk: vi.fn(async () => "personal") };
});

vi.mock("@/lib/scrapers/sources/copart", () => ({
  previewCopartLots: vi.fn(async () => [
    {
      source_deal_id: "copart-1",
      title: "2018 Ford Explorer Salvage",
      year: 2018,
      make: "Ford",
      model: "Explorer",
      condition: "salvage",
      ask_price: 8500,
      location_state: "FL",
      source_url: "https://copart.example/1",
      images: ["https://example.com/copart.jpg"],
    },
  ]),
}));

vi.mock("@/lib/scrapers/sources/govdeals", () => ({
  previewGovDeals: vi.fn(async () => [
    {
      source_deal_id: "gov-1",
      title: "2019 Mercedes-Benz C-Class C300 4MATIC",
      year: 2019,
      make: "Mercedes-Benz",
      model: "C-Class",
      condition: "run_drive",
      ask_price: 9990,
      location_city: "Miami",
      location_state: "FL",
      source_url: "https://govdeals.example/1",
      seller: "City of Miami",
      seller_type: "auction",
      seller_phone: "305-555-0100",
      auction_end_at: "2026-10-04T23:28:00Z",
      images: ["https://example.com/gov.jpg"],
    },
  ]),
}));

vi.mock("@/lib/scrapers/sources/municibid", () => ({
  previewMunicibid: vi.fn(async () => []),
}));

vi.mock("@/lib/scrapers/sources/publicsurplus", () => ({
  previewPublicSurplus: vi.fn(async () => []),
}));

let requestNumber = 0;
function req(path: string) {
  // Filter fixtures use distinct clients; the separate rate-limit suite tests repeated calls.
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { "x-real-ip": `203.0.113.${++requestNumber}` },
  });
}

// GovDeals is terms-restricted (Liquidity Services User Agreement), so these preview-path tests run
// with the operator opt-in. The honesty block below checks the default (no opt-in) refuses it.
let prevSources: string | undefined;
function optInGovDeals() {
  prevSources = process.env.SCRAPE_SOURCES;
  process.env.SCRAPE_SOURCES = "govdeals";
}
function restoreSources() {
  if (prevSources === undefined) delete process.env.SCRAPE_SOURCES;
  else process.env.SCRAPE_SOURCES = prevSources;
}

// These suites pin the terms-safe gate itself. Since 2026-10-09 the default restores the
// operator's sources (OPERATOR_RESTORED_SOURCES / OPERATOR_RESTORED_HOSTS); the gate still runs
// whenever SCRAPE_TERMS_SAFE_ONLY=1, which is what these tests exercise.
beforeEach(() => {
  vi.stubEnv("SCRAPE_TERMS_SAFE_ONLY", "1");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/scan/live-preview", () => {
  beforeEach(optInGovDeals);
  afterEach(restoreSources);

  it("excludes reported damage independently of clean title, including cached preview rows", async () => {
    const { invalidate } = await import("@/lib/cache");
    invalidate("scan:live-preview:");
    vi.mocked(previewGovDeals).mockResolvedValueOnce([
      {
        condition: "clean_title",
        damage_type: "front end",
        title: "Ford SUV",
        location_state: "FL",
        ask_price: 5000,
      } as any,
    ]);
    const { GET } = await import("./route");
    try {
      const included = await GET(
        req(
          "/api/scan/live-preview?lane=government&source=govdeals&includeRepairable=1",
        ),
      );
      expect((await included.json()).total).toBe(1);
      const excluded = await GET(
        req(
          "/api/scan/live-preview?lane=government&source=govdeals&includeRepairable=0",
        ),
      );
      expect((await excluded.json()).total).toBe(0);
    } finally {
      invalidate("scan:live-preview:");
    }
  });

  it("does not preview an explicit source outside the buyer lane", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/scan/live-preview?lane=damaged&source=govdeals&state=FL&maxPrice=10000&q=suv",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.vehicles).toEqual([]);
    expect(body.message).toMatch(/isn't available for preview/i);
    expect(body.plan.sourceIds).not.toContain("govdeals");
  });

  it("returns scoped government preview rows when lane and source match", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/scan/live-preview?lane=government&source=govdeals&state=FL&maxPrice=10000&q=mercedes",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.previewSource).toBe("govdeals");
    expect(body.total).toBe(1);
    expect(body.vehicles[0]).toMatchObject({
      source: "govdeals",
      askPrice: 9990,
      locationState: "FL",
    });
  });

  it("applies max price before returning preview rows", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/scan/live-preview?lane=government&source=govdeals&state=FL&maxPrice=5000&q=mercedes",
      ),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.total).toBe(0);
    expect(body.vehicles).toEqual([]);
    expect(body.proof[0].matchedRows).toBe(0);
  });

  it("does not fall back to other sources when the selected source has no matches", async () => {
    process.env.SCRAPE_SOURCES = "govdeals,municibid";
    vi.mocked(previewMunicibid).mockClear();
    const { GET } = await import("./route");
    const res = await GET(
      req("/api/scan/live-preview?lane=government&source=govdeals&state=MO"),
    );
    const body = await res.json();
    expect(body.vehicles).toEqual([]);
    expect(body.attemptedSources).toEqual(["govdeals"]);
    expect(previewMunicibid).not.toHaveBeenCalled();
  });

  it.each([
    "make=Ford",
    "makes=Ford,Toyota",
    "model=Explorer",
    "maxYear=2018",
    "minMileage=10000",
    "maxMileage=100000",
  ])("does not ignore requested preview criteria (%s)", async (criteria) => {
    const { GET } = await import("./route");
    const res = await GET(
      req(
        `/api/scan/live-preview?lane=government&source=govdeals&state=FL&${criteria}`,
      ),
    );
    expect((await res.json()).vehicles).toEqual([]);
  });

  it("keeps matching make/model results instead of rejecting every narrowed search", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/scan/live-preview?lane=government&source=govdeals&state=FL&make=Mercedes-Benz&model=C-Class",
      ),
    );
    expect((await res.json()).vehicles).toHaveLength(1);
  });

  it("refuses unsupported preview filters before contacting a source", async () => {
    vi.mocked(previewGovDeals).mockClear();
    const { GET } = await import("./route");
    const res = await GET(
      req(
        "/api/scan/live-preview?lane=government&source=govdeals&damage=flood",
      ),
    );
    const body = await res.json();
    expect(body.vehicles).toEqual([]);
    expect(body.unsupportedFilters).toEqual(["damage"]);
    expect(body.message).toContain("can't verify");
    expect(previewGovDeals).not.toHaveBeenCalled();
  });
});

describe("GET /api/scan/live-preview honesty", () => {
  it("never live-fetches Copart without an operator opt-in", async () => {
    const prev = process.env.SCRAPE_SOURCES;
    delete process.env.SCRAPE_SOURCES;
    try {
      const { GET } = await import("./route");
      const res = await GET(
        req("/api/scan/live-preview?lane=damaged&source=copart&state=FL"),
      );
      const body = await res.json();
      expect(previewCopartLots).not.toHaveBeenCalled();
      expect(body.vehicles).toEqual([]);
      expect(body.deskAccess).toBe("personal");
    } finally {
      if (prev !== undefined) process.env.SCRAPE_SOURCES = prev;
    }
  });

  it("never live-fetches GovDeals without an operator opt-in", async () => {
    const prev = process.env.SCRAPE_SOURCES;
    delete process.env.SCRAPE_SOURCES;
    vi.mocked(previewGovDeals).mockClear();
    try {
      const { GET } = await import("./route");
      const res = await GET(
        req(
          "/api/scan/live-preview?lane=government&source=govdeals&state=FL&maxPrice=10000&q=mercedes",
        ),
      );
      const body = await res.json();
      expect(previewGovDeals).not.toHaveBeenCalled();
      expect(body.vehicles).toEqual([]);
    } finally {
      if (prev !== undefined) process.env.SCRAPE_SOURCES = prev;
    }
  });

  it("returns deskAccess and no seller contact or fake profit to a personal desk", async () => {
    optInGovDeals();
    try {
      const { GET } = await import("./route");
      const res = await GET(
        req(
          "/api/scan/live-preview?lane=government&source=govdeals&state=FL&maxPrice=10000&q=mercedes",
        ),
      );
      const body = await res.json();
      expect(res.headers.get("cache-control") || "").toMatch(/no-store/);
      expect(body.deskAccess).toBe("personal");
      const v = body.vehicles[0];
      expect(v).not.toHaveProperty("sellerPhone");
      expect(v).not.toHaveProperty("profitEstimate");
      expect(v).not.toHaveProperty("profitScore");
      expect(v.askPrice).toBe(9990);
    } finally {
      restoreSources();
    }
  });
});
