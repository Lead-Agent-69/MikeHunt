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
    expect(page).toContain("prefs.buyerScope?.buyerMode");
    expect(page).toContain("PersonalListingLead");
    expect(page).toContain("What to verify");
    expect(page).toContain("Asking price");
    expect(page).toContain("Original listing");
    expect(page).toMatch(
      /store\.userType === "dealer" && serverDeal && \(\s*<ContactSeller/,
    );
    expect(page).toMatch(
      /store\.userType === "dealer" &&[\s\S]{0,350}<DealEconomics/,
    );
    expect(page).toMatch(
      /store\.userType === "dealer" &&[\s\S]{0,450}<ForecastPanel/,
    );
    expect(page).toMatch(
      /store\.userType === "dealer" && \(\s*<div className="flex flex-wrap items-center gap-3">/,
    );
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
});
