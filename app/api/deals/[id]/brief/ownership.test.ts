import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const generateText = vi.hoisted(() => vi.fn());
const getServerUser = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const maybeSingle = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateText }));
vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/ai/text-model", () => ({
  hasTextModel: () => true,
  activeProvider: () => "anthropic",
  getTextModel: () => ({ id: "test-model" }),
  getPremiumTextModel: () => ({ id: "test-premium" }),
}));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
      update,
    }),
  }),
}));

import { GET } from "./route";

function request(userId: string, search: string) {
  getServerUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  return GET(new NextRequest(`https://app.test/api/deals/deal-1/brief${search}`), {
    params: Promise.resolve({ id: "deal-1" }),
  });
}

describe("aiBrief overwrite ownership", () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockResolvedValue({ text: "replacement brief" });
    update.mockReset();
    update.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
    maybeSingle.mockReset();
    getServerUser.mockReset();
  });

  it("rejects a cross-user overwrite and does not write with the service role", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "deal-1",
        deal_verdict: "hold",
        deal_analysis: { aiBrief: "owner brief", aiBriefUserId: "user-a" },
      },
      error: null,
    });

    const res = await request("user-b", "?refresh=1");

    expect(res.status).toBe(403);
    expect(generateText).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects overwriting a legacy brief that has no owner", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "deal-1",
        deal_verdict: "hold",
        deal_analysis: { aiBrief: "legacy brief" },
      },
      error: null,
    });

    const res = await request("user-b", "?refresh=1");

    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("binds a new brief to the session user id", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "deal-1",
        deal_verdict: "hold",
        ask_price: 10000,
        deal_analysis: { costs: {} },
      },
      error: null,
    });

    const res = await request("user-b", "?generate=1");
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].deal_analysis.aiBriefUserId).toBe("user-b");
    expect(update.mock.calls[0][0].deal_analysis.aiBrief).toBe(
      "replacement brief",
    );
  });

  it("lets the owner refresh their own brief", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "deal-1",
        deal_verdict: "go",
        ask_price: 10000,
        deal_analysis: { aiBrief: "old", aiBriefUserId: "user-a", costs: {} },
      },
      error: null,
    });

    const res = await request("user-a", "?refresh=1");
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].deal_analysis.aiBriefUserId).toBe("user-a");
  });
});
