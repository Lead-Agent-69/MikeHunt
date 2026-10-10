import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  accessBasisFor,
  canonicalListingUrl,
  toDealSource,
  urlListingId,
} from "./provenance";

describe("toDealSource", () => {
  it("keeps the true source for hyphenated names save-from-url used to lose", () => {
    expect(toDealSource("facebook-marketplace")).toBe("facebook_marketplace");
    expect(toDealSource("ebay-motors")).toBe("ebay_motors");
    expect(toDealSource("cars-com")).toBe("cars_com");
    expect(toDealSource("Copart")).toBe("copart");
  });
  it("never relabels an unknown source as independent_dealer", () => {
    for (const s of ["web-share", "carmax", "", null, "somebody"])
      expect(toDealSource(s as string)).toBe("unknown");
  });
});

describe("stable listing ids", () => {
  it("the same listing URL gives the same id, tracking params and fragments ignored", () => {
    const a = urlListingId(
      "https://www.facebook.com/marketplace/item/123/?ref=share&mibextid=x#top",
    );
    const b = urlListingId("https://facebook.com/marketplace/item/123");
    expect(a).toBe(b);
    expect(a).toMatch(/^url:[0-9a-f]{32}$/);
    expect(urlListingId("https://facebook.com/marketplace/item/124")).not.toBe(
      a,
    );
  });
  it("query order doesn't matter but real params do", () => {
    expect(canonicalListingUrl("https://x.example/v?b=2&a=1")).toBe(
      canonicalListingUrl("https://X.example/v/?a=1&b=2"),
    );
    expect(canonicalListingUrl("https://x.example/v?id=1")).not.toBe(
      canonicalListingUrl("https://x.example/v?id=2"),
    );
  });
});

describe("access basis", () => {
  it("unknown source is unreviewed; a gov API host is api", () => {
    expect(
      accessBasisFor({ source: "unknown", source_url: "https://x.example/1" }),
    ).toBe("unreviewed");
    expect(
      accessBasisFor({
        source: "gov_auction",
        source_url: "https://www.gsaauctions.gov/auctions/auction-item/1/2",
      }),
    ).toBe("api");
  });
});

describe("wiring (Ren lineage review)", () => {
  const pipeline = readFileSync("lib/scrapers/pipeline.ts", "utf8");
  const ingest = readFileSync("app/api/ingest/route.ts", "utf8");
  const save = readFileSync("app/api/save-from-url/route.ts", "utf8");
  it("upsertDeals stamps fetched_at + access_basis and never invents a random listing id", () => {
    expect(pipeline).toContain("access_basis: accessBasisFor(");
    expect(pipeline).toContain("fetched_at: fetchedAt");
    expect(pipeline).not.toMatch(/Math\.random\(\)/);
    expect(pipeline).toContain("source: r.source");
  });
  it("/api/ingest: unknown source stays unknown; sold rows carry url + source id", () => {
    expect(ingest).toContain("toDealSource(data.source)");
    expect(ingest).not.toContain(': "independent_dealer"');
    expect(ingest).toContain("source_url: data.url");
    expect(ingest).toContain("source_item_id: listingId");
  });
  it("save-from-url keeps the true source and a stable id", () => {
    expect(save).toContain("toDealSource(detectSource(url))");
    expect(save).not.toContain("String(Date.now())");
    expect(save).toContain("urlListingId(url)");
  });
});

describe("workers/ai-worker.ts provenance (Ren #312 P2)", () => {
  it("stamps fetched_at and access_basis, and strips them until hosted has the columns", () => {
    const src = readFileSync("workers/ai-worker.ts", "utf8");
    expect(src).toContain("fetched_at: fetchedAt");
    expect(src).toContain("access_basis: accessBasisFor({ source, source_url: sourceUrl })");
    expect(src).toContain('columnsExist(supabase as any, "deals", PROVENANCE_COLUMNS)');
  });
});
