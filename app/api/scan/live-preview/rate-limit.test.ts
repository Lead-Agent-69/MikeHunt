import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const copart = vi.hoisted(() => vi.fn(async () => [] as any[]));
vi.mock("@/lib/scrapers/sources/copart", () => ({ previewCopartLots: copart }));
vi.mock("@/lib/scrapers/sources/govdeals", () => ({
  previewGovDeals: vi.fn(async () => []),
}));
vi.mock("@/lib/scrapers/sources/municibid", () => ({
  previewMunicibid: vi.fn(async () => []),
}));
vi.mock("@/lib/scrapers/sources/publicsurplus", () => ({
  previewPublicSurplus: vi.fn(async () => []),
}));

describe("GET /api/scan/live-preview", () => {
  it("rate-limits a single client before it can hammer upstream sources", async () => {
    const { GET } = await import("./route");
    const req = () =>
      new NextRequest("http://localhost/api/scan/live-preview?lane=damaged", {
        headers: { "x-real-ip": "203.0.113.9" },
      });
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await GET(req())).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[11]).toBe(429);
  });
});
