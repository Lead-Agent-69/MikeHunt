import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  listingsForDesk,
  redactListingForNonFlipDesk,
} from "./deal-desk-access";

const FLIP_KEYS = [
  "trueNetProfit",
  "true_net_profit",
  "netProfit",
  "profit",
  "profitEstimate",
  "profitScore",
  "profit_score",
  "recommendedMaxBid",
  "recommended_max_bid",
  "estimated_net_profit",
  "roi",
  "roiPct",
  "totalProfit",
  "sellerPhone",
  "sellerEmail",
  "sellerContactUrl",
  "aiRationale",
  "downsideBuffer",
  "maxProfit",
  "avgRoi",
];

describe("redactListingForNonFlipDesk covers every listing-feed key name", () => {
  it("strips flip economics and seller contact, keeps ask and market", () => {
    const card = {
      id: "1",
      askPrice: 9000,
      sellEstimate: 12000,
      estimated_resale: 12000,
      trueNetProfit: 2500,
      true_net_profit: 2500,
      profit: 2500,
      profitEstimate: 2500,
      profitScore: 80,
      profit_score: 80,
      recommendedMaxBid: 8500,
      recommended_max_bid: 8500,
      estimated_net_profit: 2500,
      roi: 22,
      roiPct: 22,
      totalProfit: 5000,
      sellerPhone: "555",
      sellerEmail: "a@b.c",
      sellerContactUrl: "https://x",
      aiRationale: { headline: "buy" },
      downsideBuffer: 1000,
      maxProfit: 3000,
      avgRoi: 18,
      alsoOn: [{ id: "2", trueNetProfit: 1, sellerPhone: "1" }],
      deals: [{ id: "3", profit: 9, askPrice: 100 }],
    };
    const out = redactListingForNonFlipDesk(card);
    for (const key of FLIP_KEYS) expect(out).not.toHaveProperty(key);
    expect(out.askPrice).toBe(9000);
    expect(out.sellEstimate).toBe(12000);
    expect(out.estimated_resale).toBe(12000);
    expect(out.alsoOn[0]).not.toHaveProperty("trueNetProfit");
    expect(out.alsoOn[0]).not.toHaveProperty("sellerPhone");
    expect(out.deals[0]).not.toHaveProperty("profit");
    expect(out.deals[0].askPrice).toBe(100);
  });

  it("strips nested dealAnalysis profit / max-bid, keeps repair costs", () => {
    const out = redactListingForNonFlipDesk({
      id: "1",
      askPrice: 9,
      dealAnalysis: {
        profit: 99,
        recommendedMaxBid: 8,
        costs: { repair: 1, transport: 2, selling: 3 },
      },
    });
    expect(out.dealAnalysis).toEqual({ costs: { repair: 1, transport: 2 } });
    expect(out).not.toHaveProperty("deal_analysis");
  });

  it("listingsForDesk is a no-op for flip desks", () => {
    const items = [{ id: "1", trueNetProfit: 9 }];
    expect(listingsForDesk(items, true)).toBe(items);
    expect(listingsForDesk(items, false)[0]).not.toHaveProperty(
      "trueNetProfit",
    );
  });
});

describe("listing feeds wire the shared desk redaction", () => {
  const files = [
    "app/api/scan/route.ts",
    "app/api/deals/best-buy/route.ts",
    "app/api/flash-deals/route.ts",
    "app/api/mispricing/route.ts",
    "app/api/market/explore/route.ts",
    "app/api/public/v1/deals/route.ts",
    "app/api/deals/map/route.ts",
    "app/api/find-similar/route.ts",
  ];

  it.each(files)("%s calls resolveCallerFlipDesk / desk gate", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(
      /resolveCallerFlipDesk|resolveCallerDesk|isFlipDeskMode/,
    );
    expect(src).toMatch(
      /listingsForDesk|redactListingForNonFlipDesk|flipDesk \?/,
    );
  });

  it("keeps market forecasts but drops flip urgency and ROI from a card prediction", () => {
    const card = {
      id: "p",
      askPrice: 9000,
      prediction: {
        daysToSell: 12,
        velocity: "fast",
        priceDropChance: 0.3,
        urgency: "act_now",
        projectedRoiPct: 22.5,
        reasons: [
          "Sells fast — ~12d (scarce supply)",
          "Act now — a fresh deal in a fast market won't last",
          "Projected ROI 22.5%",
        ],
      },
    };
    const out = redactListingForNonFlipDesk(card);
    expect(out.prediction).toEqual({
      daysToSell: 12,
      velocity: "fast",
      priceDropChance: 0.3,
      urgency: "none",
      projectedRoiPct: null,
      reasons: ["Sells fast — ~12d (scarce supply)"],
    });
    expect(card.prediction.urgency).toBe("act_now");
    expect(redactListingForNonFlipDesk({ id: "n" })).not.toHaveProperty(
      "prediction",
    );
  });
});
