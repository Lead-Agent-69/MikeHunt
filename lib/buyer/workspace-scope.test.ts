import { describe, expect, it } from "vitest";
import { buyingWorkspaceScope } from "./workspace-scope";

describe("single buying workspace", () => {
  it.each(["personal", "diy", "parts", "dealer", "reseller"])(
    "keeps %s preferences without a role selector",
    (buyerMode) => {
      const scope = {
        buyerMode,
        maxPrice: 20000,
        includeRepairable: true,
        watchedDealers: ["example.test"],
      };
      const result = buyingWorkspaceScope(scope);
      expect(result).toMatchObject({ ...scope, buyerMode: "reseller" });
      if (buyerMode !== "reseller")
        expect(result.legacyBuyerMode).toBe(buyerMode);
      expect(scope.buyerMode).toBe(buyerMode);
      expect(result).not.toHaveProperty("role");
      expect(result).not.toHaveProperty("plan");
    },
  );
  it("does not replace a previously archived choice", () => {
    expect(
      buyingWorkspaceScope({ buyerMode: "reseller", legacyBuyerMode: "parts" })
        .legacyBuyerMode,
    ).toBe("parts");
  });
});
