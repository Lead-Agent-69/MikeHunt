import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL = {
  secret: process.env.SCRAPE_SECRET,
  supabase: process.env.NEXT_PUBLIC_SUPABASE_URL,
};

afterEach(() => {
  process.env.SCRAPE_SECRET = ORIGINAL.secret;
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIGINAL.supabase;
  vi.unstubAllEnvs();
});

describe("POST /api/scrape/run auth", () => {
  it("does not return a source plan before auth", async () => {
    process.env.SCRAPE_SECRET = "scrape-test-secret";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    vi.stubEnv("NODE_ENV", "production");
    const { POST } = await import("./route");
    const res = await POST(
      new NextRequest("https://app.test/api/scrape/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          previewOnly: true,
          scope: { lane: "private", vehicleType: "suv", state: "TX" },
        }),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(401);
    expect(body.plan).toBeUndefined();
    expect(body.sources).toBeUndefined();
    expect(body.contract).toBeUndefined();
  });
});
