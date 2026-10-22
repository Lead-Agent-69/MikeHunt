import { describe, expect, it } from "vitest";
import {
  aiBriefWriteDecision,
  buildBriefModeMetadata,
  buildDeterministicDealBrief,
} from "@/app/api/deals/[id]/brief/route";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";

describe("deterministic deal brief", () => {
  it("keeps unsupported saved math out of the research brief", () => {
    const brief = buildDeterministicDealBrief({
      deal_verdict: "pass",
      true_net_profit: -3473,
      ask_price: 6980,
      sell_estimate: 7189,
      recommended_max_bid: 2309,
      condition: "salvage_title",
      damage_type: "Salvage",
      mileage: null,
      deal_analysis: {
        costs: {
          repair: 1500,
          transport: 1045,
          selling: 647,
        },
      },
    });

    expect(brief).toContain("Needs evidence");
    expect(brief).toContain("Risks:");
    expect(brief).toContain("Verify:");
    expect(brief).toContain("Mileage is missing");
    expect(brief).not.toContain("$2,309");
    expect(brief).not.toContain("$3,473");
  });

  it("uses reviewed current economics and preserves zero mileage", () => {
    const brief = buildDeterministicDealBrief(briefCandidate());
    expect(brief).toContain("The engine says GO");
    expect(brief).toContain("Keep buy-in at or below $10,400");
    expect(brief).toContain("Mileage is 0 mi");
    expect(brief).toContain("Reported clean title");
  });

  it("labels fallback and provider modes explicitly", () => {
    expect(
      buildBriefModeMetadata({
        hasProvider: false,
        provider: "none",
        cached: true,
      }),
    ).toMatchObject({
      deterministic: true,
      provider: "none",
      mode: "deterministic",
      reason: "Cached brief shown while no AI provider key is configured.",
    });

    expect(
      buildBriefModeMetadata({
        hasProvider: true,
        provider: "anthropic",
        cached: true,
      }),
    ).toMatchObject({
      deterministic: false,
      provider: "anthropic",
      mode: "provider",
      reason: "Cached provider brief.",
    });
  });
});

describe("aiBrief write ownership", () => {
  it("lets only the owning user create or overwrite a brief", () => {
    expect(aiBriefWriteDecision(null, "user-a")).toBe("create");
    expect(aiBriefWriteDecision({}, "user-a")).toBe("create");
    expect(
      aiBriefWriteDecision(
        { aiBrief: "owned", aiBriefUserId: "user-a" },
        "user-a",
      ),
    ).toBe("overwrite");
    expect(
      aiBriefWriteDecision(
        { aiBrief: "owned", aiBriefUserId: "user-a" },
        "user-b",
      ),
    ).toBe("reject");
    expect(aiBriefWriteDecision({ aiBrief: "legacy" }, "user-b")).toBe(
      "reject",
    );
    expect(
      aiBriefWriteDecision(
        { aiBrief: "owned", aiBriefUserId: "user-a" },
        "cron",
      ),
    ).toBe("reject");
    expect(aiBriefWriteDecision(null, "cron")).toBe("reject");
    expect(aiBriefWriteDecision(null, null)).toBe("reject");
  });
});
