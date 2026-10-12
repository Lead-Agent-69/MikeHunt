import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buyTerms } from "@/lib/sources/source-meta";
import { dealCardCopy } from "@/lib/deals/deal-card-copy";

const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");

describe("scale UX: /scan at thousands of listings", () => {
  it("never prints a signed profit when there is no resale basis", () => {
    expect(scan).toContain("needsComps={scanNeedsComps(car)}");
    expect(scan).toMatch(
      /!\(Number\(car\.mmrValue\) > 0\) && !\(Number\(car\.sellEstimate\) > 0\)/,
    );
    expect(scan).toContain("car.profitEstimate == null");
  });

  it("animates only the first screen of cards and lets off-screen cards skip paint", () => {
    expect(scan).toContain("const SCAN_ANIMATED_CARDS = 12;");
    expect(scan).toMatch(
      /index < SCAN_ANIMATED_CARDS \? SCAN_CARD_VARIANTS : undefined/,
    );
    expect(scan).toContain('contentVisibility: "auto"');
    expect(scan).toContain('containIntrinsicSize: "auto 720px"');
  });

  it("shows an honest end-of-list line once every listing is loaded", () => {
    expect(scan).toContain('data-testid="scan-end-of-list"');
    expect(scan).toMatch(/!hasMore && results\.length > 0 && total > 0/);
    expect(scan).toContain("for this search.");
  });
});

describe("government surplus says 'Last bid', never price or sold", () => {
  for (const src of ["gsa_auctions", "govdeals", "publicsurplus"]) {
    it(`${src} → Last bid on both desks`, () => {
      expect(buyTerms(src).priceLabel).toBe("Last bid");
      expect(dealCardCopy(true).priceLabel(src)).toBe("Last bid");
      expect(dealCardCopy(false).priceLabel(src)).toBe("Last bid");
    });
  }
  it("commercial auctions keep Current bid", () => {
    expect(buyTerms("copart").priceLabel).toBe("Current bid");
  });
});
