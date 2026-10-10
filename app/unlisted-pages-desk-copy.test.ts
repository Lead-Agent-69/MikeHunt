import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(rel, "utf8");

describe("flip copy on pages outside the menus", () => {
  it("Today consolidates into Discover instead of another personalized front door", () => {
    const today = read("app/(dashboard)/today/page.tsx");
    expect(today).toContain("redirect(");
    expect(today).toContain("/discover");
    expect(today).not.toContain("/api/system/status");
    expect(today).not.toContain("NextBestBuySpotlight");
  });

  it("Parts uses entered budgets and limits teardown to parts and flip desks", () => {
    const parts = read("app/(dashboard)/parts/page.tsx");
    expect(parts).toContain('const mode = allowTeardown ? tab : "repair"');
    expect(parts).toContain('intent?.buyerMode === "parts"');
    expect(parts).not.toContain("Standard 2025");
    expect(parts).not.toContain("% ROI");
  });
  it("Upgrade is free and never promises profit", () => {
    const upgrade = read("app/(dashboard)/upgrade/page.tsx");
    expect(upgrade).toContain("Free workspace upgrade");
    expect(upgrade).not.toContain("Every plan profits");
    expect(upgrade).not.toContain("/api/billing/checkout");
  });
});
