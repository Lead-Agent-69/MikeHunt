// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fetchWithPatchright = vi.hoisted(() =>
  vi.fn(async () => "<html><body>hi</body></html>"),
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
  fetchWithPatchright,
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

  it("still requires sign-in", async () => {
    getServerUser.mockResolvedValueOnce({ data: { user: null } } as any);
    const res = await post("https://93.184.216.34/listing");
    expect(res.status).toBe(401);
  });
});
