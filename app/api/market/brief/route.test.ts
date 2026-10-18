// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const state = vi.hoisted(() => ({
  auth: true,
  model: false,
  generate: vi.fn(),
  explore: vi.fn(),
}));
vi.mock("@/lib/auth/paid-ai", () => ({
  requirePaidAiCaller: async () =>
    state.auth
      ? { ok: true, userId: "buyer" }
      : {
          ok: false,
          response: NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 },
          ),
        },
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: () => ({ allowed: true }),
  tooManyRequests: vi.fn(),
}));
vi.mock("@/lib/ai/text-model", () => ({
  hasTextModel: () => state.model,
  getTextModel: () => "test-model",
  activeProvider: () => "test",
}));
vi.mock("ai", () => ({
  generateText: (...args: any[]) => state.generate(...args),
  Output: { object: (config: unknown) => config },
}));
vi.mock("../explore/route", () => ({
  GET: (...args: any[]) => state.explore(...args),
}));
import { POST } from "./route";
import { invalidate } from "@/lib/cache";

beforeEach(() => {
  invalidate();
  state.auth = true;
  state.model = false;
  state.generate.mockReset();
  state.explore.mockReset();
  state.explore.mockResolvedValue(
    NextResponse.json({
      summary: {
        count: 12,
        withPhotos: 10,
        fresh24h: 8,
        askingSample: 5,
        sources: { copart: 12 },
        priceKinds: { current_bid: 12 },
      },
      deskAccess: "personal",
    }),
  );
});
const request = (body: unknown = { query: "near=63101&radius=50&page=4" }) =>
  POST(
    new NextRequest("https://example.test/api/market/brief", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );

it("requires an authenticated caller before reading inventory or using AI", async () => {
  state.auth = false;
  expect((await request()).status).toBe(401);
  expect(state.explore).not.toHaveBeenCalled();
  expect(state.generate).not.toHaveBeenCalled();
});
it("uses server evidence for the complete filtered dataset, with a factual fallback when AI is unavailable", async () => {
  const body = await (await request()).json();
  expect(body.ai).toBe(false);
  expect(body.report).toContain("12 indexed matches");
  const params = new URL(state.explore.mock.calls[0][0].url).searchParams;
  expect(params.get("near")).toBe("63101");
  expect(params.get("radius")).toBe("50");
  expect(params.has("page")).toBe(false);
  expect(state.generate).not.toHaveBeenCalled();
});
it("does not swallow a location validation failure as an empty market", async () => {
  state.explore.mockResolvedValue(
    NextResponse.json({ error: "Check the ZIP" }, { status: 422 }),
  );
  expect((await request()).status).toBe(422);
});
it("falls back to the evidence brief when generation fails", async () => {
  state.model = true;
  state.generate.mockRejectedValue(new Error("Provider unavailable"));
  const body = await (await request()).json();
  expect(body.ai).toBe(false);
  expect(body.report).toContain("Recheck source availability");
});
it("rejects malformed requests before querying", async () => {
  expect((await request({ summary: { count: 9999 } })).status).toBe(400);
  expect(state.explore).not.toHaveBeenCalled();
});

it("never forwards invented AI facts or mislabeled observation counts", async () => {
  state.model = true;
  state.generate.mockResolvedValue({
    text: "Eight new listings were added and the sale price will rise.",
  });
  const body = await (await request()).json();
  expect(body.ai).toBe(false);
  expect(body.report).toContain("8 were last observed within 24 hours");
  expect(body.report).not.toContain("new listings");
  expect(body.report).not.toContain("will rise");
});

it("allows AI to choose useful checks while keeping factual text server-authored", async () => {
  state.model = true;
  state.generate.mockResolvedValue({
    output: { checks: ["confirm_price", "verify_location"] },
  });
  const body = await (await request()).json();
  expect(body.ai).toBe(true);
  expect(body.report).toContain("12 indexed matches");
  expect(body.report).toContain("8 were last observed within 24 hours");
  expect(body.report).toContain("Confirm the full asking or buy-now price");
  expect(body.report).toContain("Confirm the vehicle's pickup location");
});
