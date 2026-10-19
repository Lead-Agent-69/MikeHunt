import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deal page personal desk", () => {
  it("reads saved buyerMode and does not open personal buyers on the dealer lead", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    const store = readFileSync("lib/store/dealStore.ts", "utf8");
    const feed = readFileSync(
      "components/discovery/WatchedDealerFeed.tsx",
      "utf8",
    );

    expect(page).toContain("userTypeFromSavedBuyerMode");
    expect(page).toContain("readLocalBuyerIntent");
    expect(page).toContain("prefs.buyerScope?.legacyBuyerMode");
    expect(page).toContain("prefs.buyerScope?.buyerMode");
    expect(page).toContain("PersonalListingLead");
    expect(page).toContain("What to verify");
    expect(page).toContain("<VehicleSummary");
    expect(page).toContain("sourceLinkLabel(deal.sourceUrl)");
    // Seller contact is a buying action for every desk, not a dealer-only calculator.
    expect(page).toMatch(/\{serverDeal && \(\s*<ContactSeller/);
    expect(page).toMatch(
      /store\.userType === "dealer" &&[\s\S]{0,350}<DealEconomics/,
    );
    expect(page).toMatch(
      /store\.userType === "dealer" &&[\s\S]{0,450}<ForecastPanel/,
    );
    // Changing a desk uses the saved buying profile, not a disappearing page toggle.
    expect(page).toContain('data-testid="find-similar-cta-rail"');
    expect(page.match(/data-testid="find-similar-cta/g)).toHaveLength(1);
    expect(page).not.toContain('(["dealer", "private", "parts"] as const)');
    expect(feed).toContain("/api/discover?dealerSourceIds=");
    expect(feed).toContain("<DiscoveryCard");
    expect(feed).not.toContain("/api/scan");
    expect(feed).not.toContain("/scan?");
    expect(feed).not.toContain("Open watch scan");
    expect(feed).not.toContain("Working");
    expect(feed).not.toContain("Ready");
    expect(store).not.toMatch(/userType:\s*"dealer"/);
    expect(store).toContain('userType: "private"');
    expect(page).not.toContain("app/(dashboard)/scan/page.tsx");
  });

  it("keeps flip economics off personal, DIY, and parts desks (G1/G2)", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");

    // G1: the single decision command (net profit, ROI, score, max bid) is flip-desk only.
    expect(page).toMatch(
      /store\.userType === "dealer" \? \([\s\S]{0,350}<DecisionCommandPanel/,
    );
    expect(page).not.toContain("The Decision");
    expect(page).not.toContain("Savings vs Market");
    expect(page).not.toContain("Part-out ROI");

    // G2: max bid, valuation breakdown, and outcome logging are flip-desk only.
    expect(page).toMatch(
      /store\.userType === "dealer" && serverDeal && \(\s*<MaxBidWidget/,
    );
    expect(page).toMatch(
      /store\.userType === "dealer" &&\s*dealData\?\.deal\?\.dealAnalysis\?\.valuation &&[\s\S]{0,400}<ValuationBreakdown/,
    );
    expect(page).toMatch(
      /store\.userType === "dealer" && serverDeal && \(\s*<LogOutcome/,
    );
    // Duplicate finance / auction widgets are retired from the deal screen.
    expect(page).not.toContain("<FloorPlanCalculator");
    expect(page).not.toContain("<MaxBidCalculator");
    expect(page).not.toContain("<SortableWidgetGrid");
    expect(page).not.toContain("<AutonomousSellerNegotiator");

    // Every MaxBidWidget / ValuationBreakdown / LogOutcome render sits behind a dealer gate.
    for (const tag of ["<MaxBidWidget", "<ValuationBreakdown", "<LogOutcome"]) {
      let from = 0;
      for (;;) {
        const at = page.indexOf(tag, from);
        if (at < 0) break;
        const before = page.slice(Math.max(0, at - 2000), at);
        expect(before).toContain('store.userType === "dealer"');
        from = at + tag.length;
      }
    }

    // Personal still gets the verify-list lead and interactive price history.
    expect(page).toContain("<PersonalListingLead");
    expect(page).toContain("<PriceTimeline dealId={id} />");
  });

  it("keeps the initial vehicle read focused and defers deeper investigation", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");

    expect(page).toContain("function DetailDisclosure");
    expect(page).toContain("Vehicle examination");
    expect(page).toContain("Market evidence");
    expect(page).toContain("Plan and record");
    expect(page).toContain("Research tools");
    expect(page).toContain("<DealResearchWorkspace");
    expect(page).not.toContain("Advanced workspace");
    expect(page).toContain("Expensive children do");
    expect(page).toMatch(/\{expanded \?\s*\(/);
    expect(page).not.toContain('"/api/calibration"');
    expect(page.indexOf("<MaxBidWidget")).toBeGreaterThan(
      page.indexOf('eyebrow="Plan and record"'),
    );
  });

  it("does not mistake source fields or source inventory for inspected vehicle proof", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");

    expect(page).toContain("All-in cost is not confirmed.");
    expect(page).toContain("listing photo");
    expect(page).toContain(
      "source-provided and are not a mechanic inspection.",
    );
    expect(page).toContain("<ListingVerification");
    expect(page).not.toContain("Source inventory:");
    expect(page).not.toContain("of source rows include photos.");
    expect(page).not.toContain("Buyer math");
    expect(page).not.toContain("{detailMathConfidence} confidence");
    expect(page.indexOf("<ImageGallery")).toBeLessThan(
      page.indexOf("<PersonalListingLead"),
    );
  });
  it("uses explicit listing verification instead of unsupported confidence scores", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    expect(page).toContain("<ListingVerification");
    expect(page).toContain(
      "serverDeal.decisionEvidence?.acquisitionReady === true",
    );
    expect(page).not.toContain(
      "Listing proof, source health, and buyer math before you bid.",
    );
    expect(page).not.toContain("(detailQuality?.score || 0) >= 78");
    expect(page).toContain('store.userType === "dealer" ? "profit" : "score"');
    expect(page).not.toContain("Source status is loading for this listing.");
    expect(page).not.toContain("listingChecklistFields(detailQuality)");
  });
});
