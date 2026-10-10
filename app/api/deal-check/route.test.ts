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
  createServerComponentClient: () => {
    const c: any = {};
    for (const m of [
      "from",
      "select",
      "eq",
      "ilike",
      "gte",
      "lte",
      "gt",
      "not",
      "order",
      "limit",
    ])
      c[m] = () => c;
    c.then = (r: any) => Promise.resolve({ data: [] }).then(r);
    return c;
  },
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
