import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = readFileSync("app/(dashboard)/settings/page.tsx", "utf8");

describe("Settings fields by buyer desk", () => {
  it("shows Target Profit Threshold to reseller/dealer desks only", () => {
    expect(settings).toMatch(
      /const showProfitTarget = isFlipBuyerMode\(\s*intent\?\.buyerMode \|\| prefs\?\.buyerScope\?\.buyerMode,?\s*\)/,
    );
    expect(settings).toMatch(
      /\{showProfitTarget && \(\s*<Field\s+label="Target Profit Threshold \(\$\)"/,
    );
  });

  it("leaves the stored target_profit field alone", () => {
    // Hiding the input must not drop the value from the profile payload.
    expect(settings).toContain("target_profit: 3500");
    expect(settings).toContain("targetProfit: profile.target_profit");
  });
});
