// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fetchWithPatchright = vi.hoisted(() =>
  vi.fn(async (_url: string) => "<html><body>hi</body></html>"),
);
const fetchPublicHtml = vi.hoisted(() =>
  vi.fn(async (_url: string, _options?: unknown) => ({
    html: "<html><body>2020 Acura MDX, asking price 18000</body></html>",
    finalUrl: "https://93.184.216.34/listing",
  })),
);
vi.mock("@/lib/net/fetch-public-html", () => ({ fetchPublicHtml }));
const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "u1" } } })),
);
const captureException = vi.hoisted(() => vi.fn());
const dealRows = vi.hoisted(() => ({
  rows: [] as any[],
  error: null as any,
  sold: [] as any[],
  soldError: null as any,
  byId: null as any,
  profile: null as any,
  prefs: null as any,
}));
const tableCalls = vi.hoisted(
  () => [] as { table: string; calls: { method: string; args: any[] }[] }[],
);
const generateText = vi.hoisted(() =>
  vi.fn(async () => ({
    text: '{"vehicle":{"year":null,"make":null,"model":null,"vin":null,"mileage":null},"selling_price":1000,"fees":[],"addons":[],"taxes":null,"total_out_the_door":null,"red_flags":[]}',
  })),
);

vi.mock("ai", () => ({ generateText }));
vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("@/lib/scrapers/tools/patchright-engine", () => ({
  fetchPublicWithPatchright: fetchWithPatchright,
}));
vi.mock("@/lib/ai/document-model", () => ({
  getDocumentModel: () => ({}),
  hasDocumentModel: () => true,
}));
vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: () => new Response(null, { status: 429 }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (table: string) => {
      const c: any = {};
      const calls: { method: string; args: any[] }[] = [];
      tableCalls.push({ table, calls });
      for (const m of [
        "select",
        "eq",
        "ilike",
        "or",
        "gte",
        "lte",
        "gt",
        "not",
        "order",
        "limit",
      ])
        c[m] = (...args: any[]) => {
          calls.push({ method: m, args });
          return c;
        };
      const result = () => {
        if (
          table === "deals" &&
          calls.some((x) => x.method === "eq" && x.args[0] === "id")
        )
          return { data: dealRows.byId, error: null };
        if (table === "deals")
          return { data: dealRows.rows, error: dealRows.error };
        if (table === "sold_listings")
          return { data: dealRows.sold, error: dealRows.soldError };
        if (table === "user_profiles")
          return { data: dealRows.profile, error: null };
        if (table === "user_preferences")
          return { data: dealRows.prefs, error: null };
        return { data: null, error: null };
      };
      c.maybeSingle = () => Promise.resolve(result());
      c.then = (r: any, j: any) => Promise.resolve(result()).then(r, j);
      return c;
    },
  }),
}));

import { POST } from "./route";

function post(text: string) {
  return POST(
    new NextRequest("https://x.test/api/deal-check", {
      method: "POST",
      body: JSON.stringify({ text }),
      headers: { "content-type": "application/json" },
    }),
  );
}

beforeEach(() => {
  fetchWithPatchright.mockClear();
  fetchPublicHtml.mockClear();
  captureException.mockClear();
});

describe("POST /api/deal-check URL paste SSRF guard", () => {
  it("rejects malformed model extraction instead of returning unusable success", async () => {
    generateText.mockResolvedValueOnce({
      text: '{"selling_price":"unknown","fees":{}}',
    });
    expect((await post("Fictional offer text")).status).toBe(422);
  });
  it("rejects malformed extraction instead of displaying unchecked fields", async () => {
    generateText.mockResolvedValueOnce({
      text: '{"selling_price":"3000","fees":"none"}',
    });
    const response = await post("2020 Acura MDX asking 3000");
    expect(response.status).toBe(422);
    expect((await response.json()).extracted).toBeUndefined();
  });
  it("rejects non-string input before calling the provider", async () => {
    generateText.mockClear();
    const response = await POST(
      new NextRequest("https://x.test/api/deal-check", {
        method: "POST",
        body: JSON.stringify({ text: { url: "http://localhost" } }),
      }),
    );
    expect(response.status).toBe(400);
    expect(generateText).not.toHaveBeenCalled();
  });
  it("bounds provider work and propagates request cancellation", async () => {
    const response = await post(
      "2020 Acura MDX asking 3000, salvage auction bid",
    );
    expect(response.status).toBe(200);
    expect(generateText).toHaveBeenLastCalledWith(
      expect.objectContaining({
        timeout: 25_000,
        maxRetries: 0,
        abortSignal: expect.any(AbortSignal),
      }),
    );
  });
  it("returns a recoverable response on provider failure, not fabricated extraction", async () => {
    generateText.mockRejectedValueOnce(new Error("provider timed out"));
    const response = await post("2020 Acura MDX asking 3000");
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.extracted).toBeUndefined();
    expect(body.error).not.toContain("provider");
  });
  it.each([
    "http://127.0.0.1/admin",
    "http://localhost:3000/",
    "http://169.254.169.254/latest/meta-data/",
    "http://10.0.0.5/",
    "http://192.168.1.1/",
    "http://user:pass@example.com/",
  ])("rejects %s with 400 before the browser runs", async (url) => {
    const res = await post(url);
    expect(res.status).toBe(400);
    expect(fetchWithPatchright).not.toHaveBeenCalled();
  });

  it("reads a public page with bounded cancellable HTTP without needing a browser", async () => {
    await post("https://93.184.216.34/listing");
    expect(fetchPublicHtml).toHaveBeenCalledWith(
      "https://93.184.216.34/listing",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        maxBytes: 2_000_000,
      }),
    );
    expect(fetchWithPatchright).not.toHaveBeenCalled();
  });

  it("400s when the browser hits a blocked redirect hop", async () => {
    const { UrlNotAllowedError } = await import("@/lib/net/public-url");
    fetchPublicHtml.mockRejectedValueOnce(new UrlNotAllowedError());
    const res = await post("https://93.184.216.34/listing");
    expect(res.status).toBe(400);
  });

  it("gives a useful alternative for protected pages on serverless without launching a browser", async () => {
    vi.stubEnv("VERCEL", "1");
    fetchPublicHtml.mockResolvedValueOnce(null as any);
    try {
      const response = await post("https://93.184.216.34/listing");
      expect(response.status).toBe(422);
      expect((await response.json()).error).toContain(
        "Paste the listing details",
      );
      expect(fetchWithPatchright).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports a browser launch failure to Sentry without the URL and still 422s", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("VERCEL", "");
    fetchPublicHtml.mockResolvedValueOnce(null as any);
    fetchWithPatchright.mockRejectedValueOnce(
      new Error(
        "browserType.launch: Executable doesn't exist (navigating to https://93.184.216.34/listing?vin=SECRET)",
      ),
    );
    try {
      const res = await post("https://93.184.216.34/listing?vin=SECRET");
      expect(res.status).toBe(422);
      expect((await res.json()).error).toContain("Paste the listing details");
      expect(fetchWithPatchright).toHaveBeenCalledTimes(1);
      expect(captureException).toHaveBeenCalledTimes(1);
      const [err, ctx] = captureException.mock.calls[0];
      expect(ctx).toEqual({
        tags: { route: "deal-check", stage: "page-read" },
      });
      expect(String((err as Error).message)).not.toContain("93.184.216.34");
      expect(String((err as Error).stack)).not.toContain("SECRET");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("reports an HTTP read failure to Sentry without the URL", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchPublicHtml.mockRejectedValueOnce(
      new Error("fetch failed for https://93.184.216.34/listing?vin=SECRET"),
    );
    const res = await post("https://93.184.216.34/listing?vin=SECRET");
    expect(res.status).toBe(422);
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err] = captureException.mock.calls[0];
    expect(String((err as Error).message)).not.toContain("SECRET");
  });

  it("does not report blocked redirect hops to Sentry", async () => {
    const { UrlNotAllowedError } = await import("@/lib/net/public-url");
    fetchPublicHtml.mockRejectedValueOnce(new UrlNotAllowedError());
    const res = await post("https://93.184.216.34/listing");
    expect(res.status).toBe(400);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still requires sign-in", async () => {
    getServerUser.mockResolvedValueOnce({ data: { user: null } } as any);
    const res = await post("https://93.184.216.34/listing");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/deal-check market value", () => {
  const extraction = (
    vin: string | null = null,
    title_status: string | null = null,
  ) => ({
    text: JSON.stringify({
      vehicle: {
        year: 2020,
        make: "Acura",
        model: "MDX",
        vin,
        mileage: 40000,
        title_status,
      },
      selling_price: 30000,
      fees: [],
      addons: [],
      taxes: null,
      total_out_the_door: null,
      red_flags: [],
    }),
  });
  const row = (id: string, ask_price: number, extra: any = {}) => ({
    id,
    year: 2020,
    make: "Acura",
    model: "MDX",
    mileage: 40000,
    ask_price,
    source: "cars_com",
    source_deal_id: `cc-${id}`,
    source_url: `https://www.cars.com/vehicledetail/${id}/`,
    vin: null,
    location_state: "MO",
    last_seen_at: new Date().toISOString(),
    condition: "used",
    damage_type: null,
    title: "2020 Acura MDX",
    auction_end_at: null,
    ...extra,
  });

  beforeEach(() => {
    dealRows.rows = [];
    dealRows.error = null;
    dealRows.sold = [];
    dealRows.soldError = null;
    dealRows.byId = null;
    dealRows.profile = null;
    dealRows.prefs = null;
    tableCalls.length = 0;
  });

  it("uses the aggregateComps median, not a mean of asks, and excludes the same VIN", async () => {
    const vin = "5J8YD4H50LL000001";
    dealRows.rows = [
      row("self", 10000, { vin }),
      row("b", 28000),
      row("c", 30000),
      row("d", 32000),
      row("e", 60000),
    ];
    generateText.mockResolvedValueOnce(extraction(vin));
    const body = await (await post("2020 Acura MDX 30000")).json();
    expect(body.marketValue).toMatchObject({ known: true, sampleSize: 4 });
    // median(28k,30k,32k,60k) = 31k (upper-mid of even sample is averaged) × 0.95
    expect(body.marketComparison.marketAvg).toBe(Math.round(31000 * 0.95));
    expect(body.marketComparison.vsMarket).toBe(
      30000 - Math.round(31000 * 0.95),
    );
    expect(body.marketComparison).toMatchObject({
      evidenceType: "active_asking_prices",
      sampleSize: 4,
      excludedSelf: 1,
      basis: { kind: "ask", scope: "national", method: "median" },
    });
    expect(body.marketComparison.comps.map((c: any) => c.id)).not.toContain(
      "self",
    );
    expect(body.marketComparison.comps[0]).not.toHaveProperty("vin");
  });

  it("says market value is unknown instead of a number when fewer than 3 comps remain", async () => {
    const vin = "5J8YD4H50LL000001";
    dealRows.rows = [
      row("self", 10000, { vin }),
      row("b", 28000),
      row("c", 30000),
    ];
    generateText.mockResolvedValueOnce(extraction(vin));
    const body = await (await post("2020 Acura MDX 30000")).json();
    expect(body.marketComparison).toBeNull();
    expect(body.marketValue).toMatchObject({ known: false, value: null });
    expect(body.marketValue.reason).toMatch(/unknown/i);
  });

  it("says unknown when comps cannot be loaded", async () => {
    dealRows.error = { message: "boom" };
    generateText.mockResolvedValueOnce(extraction());
    const body = await (await post("2020 Acura MDX 30000")).json();
    expect(body.marketComparison).toBeNull();
    expect(body.marketValue).toMatchObject({ known: false, value: null });
  });

  const soldRow = (id: string, sold_price: number, extra: any = {}) => ({
    sold_price,
    sold_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
    location_state: "MO",
    source: "ebay_motors",
    source_item_id: id,
    source_url: `https://www.ebay.com/itm/${id}`,
    vin: null,
    year: 2020,
    mileage: 41000,
    title: "2020 Acura MDX Technology, clean title",
    make: "Acura",
    model: "mdx",
    ...extra,
  });

  it("prefers completed sales over asks, read with the shared sold filters", async () => {
    dealRows.rows = [row("b", 28000), row("c", 30000), row("d", 32000)];
    dealRows.sold = [
      soldRow("s1", 26000),
      soldRow("s2", 27000),
      soldRow("s3", 29000),
    ];
    generateText.mockResolvedValueOnce(extraction());
    const body = await (await post("2020 Acura MDX 30000")).json();
    expect(body.marketComparison).toMatchObject({
      marketAvg: 27000,
      evidenceType: "sold_prices",
      sampleSize: 3,
      basis: { kind: "sold", scope: "national", method: "median" },
      soldCompsUnavailable: false,
    });
    const sold = tableCalls.find((t) => t.table === "sold_listings")!.calls;
    expect(sold).toContainEqual({ method: "eq", args: ["basis", "sold"] });
    expect(sold).toContainEqual({
      method: "or",
      args: ["model.eq.mdx,model.ilike.MDX*"],
    });
    expect(sold).toContainEqual({ method: "gte", args: ["year", 2019] });
    expect(sold).toContainEqual({ method: "lte", args: ["year", 2021] });
    const cutoff = sold.find(
      (c) => c.method === "gte" && c.args[0] === "sold_at",
    )!;
    const days = (Date.now() - Date.parse(cutoff.args[1])) / 86_400_000;
    expect(Math.round(days)).toBe(180);
  });

  it("uses the buyer's home state for same-state sold comps", async () => {
    dealRows.prefs = { prefs: { homeLocation: { state: "IL" } } };
    dealRows.sold = [
      soldRow("s1", 20000),
      soldRow("s2", 21000),
      soldRow("s3", 22000),
      soldRow("i1", 30000, { location_state: "IL" }),
      soldRow("i2", 31000, { location_state: "IL" }),
      soldRow("i3", 32000, { location_state: "IL" }),
    ];
    generateText.mockResolvedValueOnce(extraction());
    const body = await (await post("2020 Acura MDX 30000")).json();
    expect(body.marketComparison).toMatchObject({
      marketAvg: 31000,
      marketState: "IL",
      basis: { kind: "sold", scope: "state" },
    });
  });

  it("never mixes salvage and clean sold comps", async () => {
    dealRows.rows = [];
    dealRows.sold = [
      soldRow("c1", 30000),
      soldRow("c2", 31000),
      soldRow("c3", 32000),
      soldRow("x1", 12000, { title: "2020 Acura MDX salvage title" }),
      soldRow("x2", 13000, { title: "2020 Acura MDX flood" }),
    ];
    generateText.mockResolvedValueOnce(extraction());
    const clean = await (await post("2020 Acura MDX 30000")).json();
    expect(clean.marketComparison).toMatchObject({
      marketAvg: 31000,
      excludedTitle: 2,
      titleLane: ["clean", "unknown"],
    });
    // A salvage vehicle: only 2 salvage sales, so unknown, never the clean median.
    generateText.mockResolvedValueOnce(extraction(null, "Salvage"));
    const salvage = await (await post("2020 Acura MDX 30000")).json();
    expect(salvage.marketComparison).toBeNull();
    expect(salvage.marketValue).toMatchObject({ known: false, value: null });
    dealRows.sold.push(
      soldRow("x3", 14000, { title: "2020 Acura MDX SALVAGE, runs" }),
    );
    generateText.mockResolvedValueOnce(extraction(null, "Salvage"));
    const enough = await (await post("2020 Acura MDX 30000")).json();
    expect(enough.marketComparison).toMatchObject({
      titleCategory: "salvage",
      titleLane: ["salvage"],
      excludedTitle: 3,
    });
  });

  it("takes the title lane from the deal being checked when it has one", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    dealRows.byId = {
      id,
      source: "copart",
      source_deal_id: "lot-9",
      location_state: "TX",
      condition: "salvage_title",
    };
    dealRows.sold = [
      soldRow("c1", 30000),
      soldRow("c2", 31000),
      soldRow("c3", 32000),
    ];
    generateText.mockResolvedValueOnce(extraction());
    const res = await POST(
      new NextRequest("https://x.test/api/deal-check", {
        method: "POST",
        body: JSON.stringify({ text: "2020 Acura MDX 30000", dealId: id }),
        headers: { "content-type": "application/json" },
      }),
    );
    const body = await res.json();
    expect(body.marketComparison).toBeNull();
    expect(body.marketValue.known).toBe(false);
  });

  it("falls back to asks and says so when sold comps cannot be read", async () => {
    dealRows.rows = [row("b", 28000), row("c", 30000), row("d", 32000)];
    dealRows.soldError = { code: "57014", message: "timeout" };
    generateText.mockResolvedValueOnce(extraction());
    const body = await (await post("2020 Acura MDX 30000")).json();
    expect(body.marketComparison).toMatchObject({
      evidenceType: "active_asking_prices",
      soldCompsUnavailable: true,
    });
  });
});
