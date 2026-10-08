import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(rel, "utf8");

describe("flip copy on pages outside the menus", () => {
  it("Today keeps flip widgets and profit sort on reseller/dealer desks", () => {
    const today = read("app/(dashboard)/today/page.tsx");
    expect(today).not.toContain('"/scan?sort=profit"');
    expect(today).not.toContain("sort=profit`");
    expect(today).toContain("defaultScanSort(intent?.buyerMode)");
    expect(today).toContain("{flipDesk && <NextBestBuySpotlight />}");
    expect(today).toContain("{flipDesk && <MarketPulse />}");
    expect(today).toMatch(
      /\{flipDesk && \(\s*<IntelRail\s+endpoint="\/api\/recommendations"/,
    );
    expect(today).toContain('flipDesk ? "bidding" : "buying"');
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
