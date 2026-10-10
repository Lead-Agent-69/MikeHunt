import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  politeFetch: vi.fn(),
  upsertDeals: vi.fn(async (d: unknown[]) => d.length),
  knownVins: vi.fn(async () => new Set<string>()),
  dropKnownListings: vi.fn(async (d: unknown[]) => ({ fresh: d, dropped: 0 })),
}));
vi.mock("@/lib/scrapers/polite", () => ({ politeFetch: mocks.politeFetch }));
vi.mock("../pipeline", () => ({ upsertDeals: mocks.upsertDeals }));
vi.mock("./aggregator-dedup", async (orig) => ({
  ...(await orig<typeof import("./aggregator-dedup")>()),
  knownVins: mocks.knownVins,
  dropKnownListings: mocks.dropKnownListings,
}));

import {
  parseVisorListing,
  parseVisorSitemap,
  runVisorCapture,
  scrapeVisor,
} from "./visor";
import {
  accessClassFor,
  photoCacheAllowed,
  SOURCE_ACCESS,
} from "../access-class";

const fx = (f: string) =>
  readFileSync(join(__dirname, "__fixtures__", f), "utf8");
const LISTING = fx("visor-listing.html");
const SITEMAP = fx("visor-sitemap.xml");
const ok = (body: string) => ({
  ok: true,
  status: 200,
  body,
  fromCache: false,
  notModified: false,
  url: "",
});

describe("parseVisorSitemap", () => {
  it("reads listing URLs + VINs, newest lastmod first, Visor host only", () => {
    const entries = parseVisorSitemap(
      SITEMAP +
        "<url><loc>https://evil.example/search/listings/19XFC2F77JE043972</loc></url>",
    );
    expect(entries.map((e) => e.vin)).toEqual([
      "1C3BDECZ2GV100414",
      "19XFC2F77JE043972",
      "1B3ER69E0YV604953",
    ]);
    expect(entries[0].url).toBe(
      "https://visor.vin/search/listings/1C3BDECZ2GV100414",
    );
  });
});

describe("parseVisorListing (real page, 2026-10-10)", () => {
  it("maps the schema.org Vehicle block to a thin dealer row under the dealer's own URL", () => {
    const visorUrl = "https://visor.vin/search/listings/1C4RJFN91MC817769";
    const row = parseVisorListing(LISTING, visorUrl)!;
    expect(row).toMatchObject({
      source: "independent_dealer",
      source_deal_id: "visor-1C4RJFN91MC817769",
      source_url:
        "https://www.hollingsheadmotorsales.com/Inventory/Details/a20a98f6-6b3d-423c-be67-8c405c930c2d",
      year: 2021,
      make: "Jeep",
      model: "Grand Cherokee",
      trim: "Trackhawk",
      vin: "1C4RJFN91MC817769",
      ask_price: 82995,
      mileage: 28153,
      location_city: "Cambridge",
      location_state: "OH",
      location_zip: "43725",
      seller_type: "dealer",
    });
    expect(row.images!.length).toBeLessThanOrEqual(6);
    expect((row as any).options).toMatchObject({
      discoveredVia: "visor",
      discoveredUrl: visorUrl,
    });
    expect(JSON.stringify(row)).not.toContain("(000) 000-0000"); // no seller phone stored
    // Ren #321 P2: no dealer name in seller or options.seller.
    expect(row).not.toHaveProperty("seller");
    expect((row as any).options).not.toHaveProperty("seller");
    expect(JSON.stringify(row)).not.toMatch(/HOLLINGSHEAD MOTOR SALES/i);
    expect(row.images!.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("keeps https photo URLs only", () => {
    const page = LISTING.replace(
      '"image": ["https://',
      '"image": ["http://plain.example/a.jpg", "//cdn.example/b.jpg", "data:image/png;base64,AAAA", "https://',
    );
    const row = parseVisorListing(
      page,
      "https://visor.vin/search/listings/1C4RJFN91MC817769",
    )!;
    expect(row.images!.length).toBeGreaterThan(0);
    expect(row.images!.every((u) => u.startsWith("https://"))).toBe(true);
  });

  it("rejects pages without a usable vehicle (no JSON-LD, bad VIN, no price, non-car)", () => {
    expect(parseVisorListing("<html></html>", "u")).toBeUndefined();
    expect(
      parseVisorListing(
        LISTING.replace(
          /"vehicleIdentificationNumber": "[A-Z0-9]+"/,
          '"vehicleIdentificationNumber": "SHORTVIN"',
        ),
        "u",
      ),
    ).toBeUndefined();
    expect(
      parseVisorListing(LISTING.replace('"price": 82995', '"price": 0'), "u"),
    ).toBeUndefined();
    expect(
      parseVisorListing(
        LISTING.replace('"bodyType": "SUV"', '"bodyType": "Motorcycle"'),
        "u",
      ),
    ).toBeUndefined();
  });
});

describe("runVisorCapture", () => {
  beforeEach(() => {
    mocks.politeFetch.mockReset();
    mocks.upsertDeals.mockClear();
    mocks.knownVins.mockReset().mockResolvedValue(new Set());
    mocks.dropKnownListings.mockClear();
  });

  it("skips VINs we already hold before fetching, stores the rest", async () => {
    mocks.knownVins.mockResolvedValue(
      new Set(["19XFC2F77JE043972", "1B3ER69E0YV604953"]),
    );
    mocks.politeFetch.mockImplementation(async (url: string) =>
      url.includes("sitemaps") ? ok(SITEMAP) : ok(LISTING),
    );
    const r = await runVisorCapture(10);
    expect(r).toMatchObject({
      outcome: "ok",
      sitemapListings: 3,
      alreadyKnown: 2,
      fetched: 1,
      parsed: 1,
      stored: 1,
    });
    const pages = mocks.politeFetch.mock.calls
      .map((c) => c[0])
      .filter((u: string) => u.includes("/search/listings/"));
    expect(pages).toEqual([
      "https://visor.vin/search/listings/1C3BDECZ2GV100414",
    ]);
  });

  it("records a challenge and stops; the runner fails the run instead of reporting 0 rows", async () => {
    mocks.politeFetch.mockImplementation(async (url: string) =>
      url.includes("sitemaps")
        ? ok(SITEMAP)
        : {
            ok: false,
            status: 403,
            body: "",
            challenge: true,
            fromCache: false,
            notModified: false,
            url,
          },
    );
    const r = await runVisorCapture(10);
    expect(r).toMatchObject({ outcome: "challenged", fetched: 0, parsed: 0 });
    expect(mocks.politeFetch).toHaveBeenCalledTimes(2); // sitemap + first page only
    await expect(scrapeVisor()).rejects.toThrow(/challenged: visor\.vin/);
  });

  it("honours robots (politeFetch skip) without requesting pages", async () => {
    mocks.politeFetch.mockResolvedValue({
      ok: false,
      status: 0,
      body: "",
      skipped: "robots",
      fromCache: false,
      notModified: false,
      url: "",
    });
    const r = await runVisorCapture(10);
    expect(r.outcome).toBe("robots");
    expect(mocks.politeFetch).toHaveBeenCalledTimes(1);
  });
});

describe("access class for aggregator-discovered rows", () => {
  it("records Visor and AutoTempest as operator_override, not permission", () => {
    expect(SOURCE_ACCESS.visor.access).toBe("operator_override");
    expect(SOURCE_ACCESS.autotempest.access).toBe("operator_override");
  });
  it("a Visor-discovered dealer row stays operator_override and its photos are never cached", () => {
    const row = {
      source: "independent_dealer",
      source_url: "https://www.hollingsheadmotorsales.com/Inventory/Details/x",
      options: { discoveredVia: "visor" },
    };
    expect(accessClassFor(row)).toBe("operator_override");
    expect(photoCacheAllowed(row)).toBe(false);
    expect(accessClassFor({ ...row, options: null })).toBe("allowed");
  });
});
