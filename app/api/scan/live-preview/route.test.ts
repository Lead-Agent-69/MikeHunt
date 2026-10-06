import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { previewCopartLots } from "@/lib/scrapers/sources/copart";

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

function req(path: string) {
  return new NextRequest(`http://localhost:3000${path}`);
}

describe("GET /api/scan/live-preview", () => {
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
    expect(body.message).toMatch(
      /does not have a public no-auth preview path/i,
    );
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

  it("returns deskAccess and no seller contact or fake profit to a personal desk", async () => {
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
  });
});
