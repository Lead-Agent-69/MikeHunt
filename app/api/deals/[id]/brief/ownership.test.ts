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
const savedMode = vi.hoisted(() => ({ value: "dealer" as string | null }));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle:
            table === "user_preferences"
              ? async () => ({
                  data: savedMode.value
                    ? { prefs: { buyerScope: { buyerMode: savedMode.value } } }
                    : null,
                  error: null,
                })
              : maybeSingle,
        }),
      }),
      update,
    }),
  }),
}));

import { GET } from "./route";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
import { dealBriefEvidence } from "@/lib/deals/deal-brief-evidence";

function request(userId: string, search: string) {
  getServerUser.mockResolvedValue({
    data: { user: { id: userId } },
    error: null,
  });
  return GET(
    new NextRequest(`https://app.test/api/deals/deal-1/brief${search}`),
    {
      params: Promise.resolve({ id: "deal-1" }),
    },
  );
}

describe("aiBrief overwrite ownership", () => {
  beforeEach(() => {
    generateText.mockReset();
    generateText.mockResolvedValue({ text: "replacement brief" });
    update.mockReset();
    update.mockReturnValue({ eq: vi.fn(async () => ({ error: null })) });
    maybeSingle.mockReset();
    getServerUser.mockReset();
    savedMode.value = "dealer";
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
        ...briefCandidate(),
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
    expect(update.mock.calls[0][0].deal_analysis.aiBriefEvidenceKey).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect(update.mock.calls[0][0].deal_analysis.aiBriefProvider).toBe(
      "anthropic",
    );
    const prompt = generateText.mock.calls[0][0].prompt;
    expect(prompt).toContain("Mileage reported: 0");
    expect(prompt).toContain("Reported clean title");
    expect(prompt).toContain(
      "Holding cost per day and days to sell are not established",
    );
    expect(prompt).not.toContain("$30/day");
  });

  it("lets the owner refresh their own brief", async () => {
    maybeSingle.mockResolvedValue({
      data: (() => {
        const d = briefCandidate();
        return {
          ...d,
          deal_analysis: {
            ...d.deal_analysis,
            aiBrief: "old",
            aiBriefUserId: "user-a",
          },
        };
      })(),
      error: null,
    });

    const res = await request("user-a", "?refresh=1");
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].deal_analysis.aiBriefUserId).toBe("user-a");
  });

  describe("desk gate", () => {
    const cachedDeal = {
      data: {
        id: "deal-1",
        deal_verdict: "go",
        true_net_profit: 4100,
        recommended_max_bid: 10400,
        deal_analysis: {
          aiBrief: "Net profit $4,100. Keep buy-in at or below $10,400.",
          aiBriefUserId: "user-a",
        },
      },
      error: null,
    };

    it("replaces unsupported cached profit claims with a current research checklist", async () => {
      maybeSingle.mockResolvedValue(cachedDeal);
      const res = await request("user-a", "");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.brief).toContain("Needs evidence");
      expect(body.brief).not.toContain("$4,100");
      expect(body.canGenerate).toBe(false);
      expect(generateText).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it("serves a matching evidence-qualified cache, but invalidates it when facts change", async () => {
      const d = briefCandidate();
      Object.assign(d.deal_analysis, {
        aiBrief: "qualified estimate",
        aiBriefUserId: "user-a",
        aiBriefEvidenceKey: dealBriefEvidence(d).key,
      });
      maybeSingle.mockResolvedValue({ data: d, error: null });
      const cached = await (await request("user-a", "")).json();
      expect(cached.brief).toBe("qualified estimate");
      expect(cached.cached).toBe(true);
      d.ask_price = 11000;
      const changed = await (await request("user-a", "")).json();
      expect(changed.brief).not.toBe("qualified estimate");
      expect(generateText).not.toHaveBeenCalled();
    });

    it("returns incomplete evidence on an explicit generate without spending tokens or writing", async () => {
      maybeSingle.mockResolvedValue({
        data: { id: "deal-1", deal_verdict: "go", true_net_profit: 4100 },
        error: null,
      });
      const res = await request("user-b", "?generate=1");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        evidenceReady: false,
        canGenerate: false,
        cached: false,
      });
      expect(generateText).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it.each([
      ["personal", "personal"],
      ["diy", "diy"],
      ["parts", "parts"],
      ["unknown", "fleet-manager"],
      ["no saved mode", null],
    ])("hides the brief from a %s desk", async (_label, mode) => {
      savedMode.value = mode;
      maybeSingle.mockResolvedValue(cachedDeal);
      const res = await request("user-a", "");
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body).toEqual({
        brief: null,
        canGenerate: false,
        deskAccess: "personal",
      });
      expect(JSON.stringify(body)).not.toContain("4,100");
    });

    it("hides the brief from a signed-out caller", async () => {
      getServerUser.mockResolvedValue({ data: { user: null }, error: null });
      maybeSingle.mockResolvedValue(cachedDeal);
      const res = await GET(
        new NextRequest("https://app.test/api/deals/deal-1/brief"),
        { params: Promise.resolve({ id: "deal-1" }) },
      );
      const body = await res.json();
      expect(body.brief).toBeNull();
      expect(body.canGenerate).toBe(false);
    });

    it("refuses generation for a non-flip desk without spending tokens", async () => {
      savedMode.value = "personal";
      maybeSingle.mockResolvedValue({
        data: { id: "deal-1", deal_analysis: { costs: {} } },
        error: null,
      });
      const res = await request("user-b", "?generate=1");
      expect(res.status).toBe(403);
      expect(generateText).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
