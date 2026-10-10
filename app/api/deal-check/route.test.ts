// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fetchWithPatchright = vi.hoisted(() =>
  vi.fn(async (_url: string) => "<html><body>hi</body></html>"),
);
const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "u1" } } })),
);
const captureException = vi.hoisted(() => vi.fn());
const generateText = vi.hoisted(() =>
  vi.fn(async () => ({
    text: '{"selling_price":1000,"fees":[],"addons":[],"red_flags":[]}',
  })),
);

vi.mock("ai", () => ({ generateText }));
vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("@/lib/scrapers/tools/patchright-engine", () => ({
  fetchPublicWithPatchright: fetchWithPatchright,
}));
vi.mock("@/lib/ai/text-model", () => ({
  getTextModel: () => ({}),
  hasTextModel: () => true,
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
  captureException.mockClear();
});

describe("POST /api/deal-check URL paste SSRF guard", () => {
  it("rejects malformed model extraction instead of returning unusable success", async () => {
    generateText.mockResolvedValueOnce({
      text: '{"selling_price":"unknown","fees":{}}',
    });
    expect((await post("Fictional offer text")).status).toBe(422);
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

  it("lets a public IP-literal URL through to the browser", async () => {
    await post("https://93.184.216.34/listing");
    expect(fetchWithPatchright).toHaveBeenCalledWith(
      "https://93.184.216.34/listing",
    );
  });

  it("400s when the browser hits a blocked redirect hop", async () => {
    const { UrlNotAllowedError } = await import("@/lib/net/public-url");
    fetchWithPatchright.mockRejectedValueOnce(new UrlNotAllowedError());
    const res = await post("https://93.184.216.34/listing");
    expect(res.status).toBe(400);
  });

  it("reports a browser launch failure to Sentry without the URL and still 422s", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchWithPatchright.mockRejectedValueOnce(
      new Error(
        "browserType.launch: Executable doesn't exist (navigating to https://93.184.216.34/listing?vin=SECRET)",
      ),
    );
    const res = await post("https://93.184.216.34/listing?vin=SECRET");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      error:
        "Could not read the provided URL. The site might be heavily protected.",
    });
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, ctx] = captureException.mock.calls[0];
    expect(ctx).toEqual({ tags: { route: "deal-check", stage: "patchright" } });
    expect(String((err as Error).message)).not.toContain("93.184.216.34");
    expect(String((err as Error).stack)).not.toContain("SECRET");
  });

  it("does not report blocked redirect hops to Sentry", async () => {
    const { UrlNotAllowedError } = await import("@/lib/net/public-url");
    fetchWithPatchright.mockRejectedValueOnce(new UrlNotAllowedError());
    await post("https://93.184.216.34/listing");
    expect(captureException).not.toHaveBeenCalled();
  });

  it("still requires sign-in", async () => {
    getServerUser.mockResolvedValueOnce({ data: { user: null } } as any);
    const res = await post("https://93.184.216.34/listing");
    expect(res.status).toBe(401);
  });
});
