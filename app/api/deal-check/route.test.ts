// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fetchWithPatchright = vi.hoisted(() =>
  vi.fn(async (_url: string) => "<html><body>hi</body></html>"),
);
const getServerUser = vi.hoisted(() =>
  vi.fn(async () => ({ data: { user: { id: "u1" } } })),
);
const generateText = vi.hoisted(() =>
  vi.fn(async () => ({
    text: '{"selling_price":1000,"fees":[],"addons":[],"red_flags":[]}',
  })),
);

vi.mock("ai", () => ({ generateText }));
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

beforeEach(() => fetchWithPatchright.mockClear());

describe("POST /api/deal-check URL paste SSRF guard", () => {
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
    expect(response.status).toBe(422);
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

  it("still requires sign-in", async () => {
    getServerUser.mockResolvedValueOnce({ data: { user: null } } as any);
    const res = await post("https://93.184.216.34/listing");
    expect(res.status).toBe(401);
  });
});
