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

  it("Parts shows Teardown ROI to parts buyers and flip desks only", () => {
    const parts = read("app/(dashboard)/parts/page.tsx");
    expect(parts).toMatch(
      /const showTeardown =\s*isFlipBuyerMode\(intent\?\.buyerMode\) \|\|\s*normalizeFlipLeadMode\(intent\?\.buyerMode\) === "parts";/,
    );
    expect(parts).toMatch(
      /\.\.\.\(showTeardown\s*\?\s*\[\{ id: "teardown", label: "Teardown ROI" \}\]\s*:\s*\[\]\)/,
    );
    expect(parts).toContain(
      '!showTeardown && activeTab === "teardown" ? "repair" : activeTab',
    );
    expect(parts).not.toMatch(/\{activeTab === "/);
    expect(parts).not.toContain("arbitrage and recon");
  });

  it("Upgrade only promises profit to flip desks", () => {
    const upgrade = read("app/(dashboard)/upgrade/page.tsx");
    expect(upgrade).toMatch(
      /isFlipBuyerMode\(intent\?\.buyerMode\)\s*\?\s*"Every plan profits you more than it costs\. Cancel anytime\."\s*:\s*"Pick the plan that fits how you buy\. Cancel anytime\."/,
    );
  });
});
