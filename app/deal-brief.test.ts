import { describe, expect, it } from "vitest";
import {
  buildBriefModeMetadata,
  buildDeterministicDealBrief,
} from "@/app/api/deals/[id]/brief/route";

describe("deterministic deal brief", () => {
  it("builds a buyer brief from saved deal math when AI is offline", () => {
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

    expect(brief).toContain("The engine says PASS");
    expect(brief).toContain("Risks:");
    expect(brief).toContain("Verify:");
    expect(brief).toContain("Mileage is missing");
    expect(brief).toContain("Keep buy-in at or below $2,309");
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
        provider: "openai",
        cached: true,
      }),
    ).toMatchObject({
      deterministic: false,
      provider: "openai",
      mode: "provider",
      reason: "Cached provider brief.",
    });
  });
});
