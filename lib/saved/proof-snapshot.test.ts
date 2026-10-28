import { expect, it } from "vitest";
import {
  sourceBackedSavedSnapshot,
  savedTrustExplanation,
  sanitizeClientProofSnapshot,
} from "./proof-snapshot";
import { savedCarsForDesk } from "./saved-car-desk-redact";
const sparse = {
  source: "independent_dealer",
  sourceUrl: "https://example.com/car/123",
  sellerType: "dealer",
  images: ["https://example.com/vehicle.jpg"],
  lastSeenAt: "2026-10-20T00:00:00Z",
  priceEvidence: { kind: "down_payment", listedAmount: 2180 },
  askingPrice: 2180,
};
it("does not let client confidence or a deposit amount overwrite source evidence", () => {
  const result = sourceBackedSavedSnapshot(sparse, {
    dataQuality: { score: 100, label: "Excellent", missing: [] },
    trustExplanation: {
      confidence: "high",
      score: 100,
      reasons: ["Guaranteed profit"],
      nextChecks: [],
    },
  });
  expect(result.dataQuality.score).toBeLessThan(68);
  expect(result.trustExplanation.confidence).toBe("low");
  expect(result.trustExplanation.reasons).not.toContain("Guaranteed profit");
  expect(result.trustExplanation.nextChecks).toContain(
    "confirm full purchase price",
  );
  expect(result.searchContextAtSave).toMatchObject({
    origin: "client",
    verified: false,
  });
  expect(result.priceEvidence).toEqual(sparse.priceEvidence);
  expect(result.lastSeenAt).toBe(sparse.lastSeenAt);
});
it("does not use a large model profit to improve evidence confidence", () => {
  const quality = { score: 65, missing: ["VIN", "mileage"] };
  const baseline = savedTrustExplanation({ ...sparse, dataQuality: quality });
  expect(
    savedTrustExplanation({
      ...sparse,
      estimatedProfit: 99999999,
      profitScore: 100,
      dataQuality: quality,
    }),
  ).toEqual(baseline);
});
it("reassesses legacy confidence without rewriting the saved row or history", () => {
  const row = {
    id: "saved",
    user_id: "owner",
    snapshot: {
      ...sparse,
      dataQuality: { score: 100, missing: [] },
      trustExplanation: { confidence: "high", summary: "Guaranteed profit" },
    },
  };
  const before = structuredClone(row);
  const result = savedCarsForDesk([row], true)[0];
  expect(result.snapshot.dataQuality.score).toBeLessThan(68);
  expect(result.snapshot.trustExplanation.summary).not.toBe(
    "Guaranteed profit",
  );
  expect(result.id).toBe("saved");
  expect(row).toEqual(before);
});
it("keeps retail checks free of irrelevant auction timing", () => {
  expect(
    sourceBackedSavedSnapshot(sparse).trustExplanation.nextChecks,
  ).not.toContain("confirm auction timing");
});
it("requires final auction cost rather than treating the bid as a cash price", () => {
  const result = sourceBackedSavedSnapshot({
    ...sparse,
    source: "copart",
    sellerType: "auction",
    priceEvidence: { kind: "current_bid" },
  });
  expect(result.trustExplanation.nextChecks).toContain(
    "confirm final auction cost and fees",
  );
});
it("keeps unverified client context out of personal-desk evidence", () => {
  const snapshot = sourceBackedSavedSnapshot(sparse, {
    trustExplanation: { summary: "$99,999 profit" },
  });
  const result = savedCarsForDesk([{ snapshot }], false)[0];
  expect(result.snapshot.searchContextAtSave).toBeUndefined();
  expect(result.snapshot.trustExplanation.summary).not.toContain("profit");
  expect(snapshot.searchContextAtSave).toBeDefined();
});
it("bounds context and keeps Unicode valid for JSONB", () => {
  const proof = sanitizeClientProofSnapshot({
    dataQuality: { score: Infinity, missing: ["x".repeat(100000)] },
    trustExplanation: {
      score: NaN,
      reasons: ["x".repeat(239) + "\u{1F697}" + "tail", "\u0000\ud800"],
      summary: "x".repeat(239) + "\u{1F697}",
    },
  });
  expect(proof.dataQuality?.score).toBe(0);
  expect(proof.dataQuality?.missing[0]).toHaveLength(240);
  expect(proof.trustExplanation?.reasons).toEqual(["x".repeat(239)]);
  expect(proof.trustExplanation?.summary).toBe("x".repeat(239));
});
