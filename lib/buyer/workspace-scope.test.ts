import { describe, expect, it } from "vitest";
import { buyingWorkspaceScope } from "./workspace-scope";

describe("buying-purpose preservation", () => {
  it.each(["personal", "diy", "parts", "dealer", "reseller"])(
    "preserves the selected %s purpose without granting an account role",
    (buyerMode) => {
      const scope = {
        buyerMode,
        maxPrice: 20000,
        includeRepairable: true,
        watchedDealers: ["example.test"],
      };
      const result = buyingWorkspaceScope(scope);
      expect(result).toMatchObject(scope);
      expect(scope.buyerMode).toBe(buyerMode);
      expect(result).not.toHaveProperty("role");
      expect(result).not.toHaveProperty("plan");
    },
  );
  it("defaults missing or invalid purposes to personal without inferring resale", () => {
    expect(buyingWorkspaceScope({}).buyerMode).toBe("personal");
    expect(buyingWorkspaceScope({ buyerMode: "admin" }).buyerMode).toBe(
      "personal",
    );
  });
  it("does not replace a previously archived choice", () => {
    expect(
      buyingWorkspaceScope({ buyerMode: "reseller", legacyBuyerMode: "parts" })
        .legacyBuyerMode,
    ).toBe("parts");
  });
});
