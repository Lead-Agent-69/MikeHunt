import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("buyer-facing polish", () => {
  it("keeps onboarding focused on buyer language instead of internal source ids", () => {
    const source = read("app/onboarding/page.tsx");

    expect(source).not.toContain("dealer.sourceId");
    expect(source).not.toContain("through exact dealer source IDs");
    expect(source).toContain("What are you buying for?");
    expect(source).toContain("Your search, your choices");
    expect(source).toContain("Your first search");
    expect(source).not.toContain('fetch("/api/scrape/run")');
  });

  it("keeps Discover focused on the buyer's choices and real listings", () => {
    const source = read("app/(dashboard)/discover/page.tsx");

    expect(source).not.toContain("Drag or swipe to explore");
    expect(source).toContain("Buying for");
    expect(source).toContain("Refine search");
    expect(source).not.toContain("<BuyerScopeBuilder");
    expect(source).not.toContain("<SetupStatusPanel");
    expect(source).not.toContain("Scanning the market");
    expect(source).not.toContain("Open scanner");
    expect(source).toContain("Widen the state or raise the budget");
    expect(source).toContain("Distance not available until a listing has real miles.");
  });

  it("does not sell Discover profit as money on the table", () => {
    const hero = read("components/discovery/DiscoverHero.tsx");
    const api = read("app/api/discover/hero/route.ts");
    expect(hero).toContain("This is not money you can make.");
    expect(hero).not.toContain("Profit on the table");
    expect(hero).not.toContain("Today's best flip");
    expect(api).not.toContain("totalProfit");
    expect(api).not.toContain("true_net_profit");
  });

  it("labels title claims as reported rather than a condition guarantee", () => {
    const card = read("components/discovery/DiscoveryCard.tsx");

    expect(card).toContain("Clean title reported");
    expect(card).toContain("Listing-reported title status");
    expect(card).not.toContain("No major issues found");
  });

  it("shows source display names instead of raw registry ids in the smart-run copy", () => {
    const source = read("components/discovery/BuyerScopeBuilder.tsx");

    expect(source).toContain("formatSourceList(scrapePlan.sourceIds, 4)");
    expect(source).toContain("sourceMeta(sourceId).label");
    expect(source).not.toContain('scrapePlan.sourceIds.slice(0, 4).join(", ")');
  });

  it("uses the active device scope before an older cloud fallback", () => {
    const source = read("components/discovery/BuyerScopeBuilder.tsx");

    expect(source).toContain("const localScope = readLocalBuyerIntent()");
    expect(source).toContain("if (!localScope)");
    expect(source).toContain("let saved: any = localScope || {}");
  });

  it("shows source display names instead of raw registry ids in Scan proof copy", () => {
    const source = read("app/(dashboard)/scan/page.tsx");

    expect(source).toContain("sourceListText(plan.sourceIds)");
    expect(source).toContain("sourceMeta(sourceId).label");
    expect(source).not.toContain('plan.sourceIds.join(", ")');
    expect(source).not.toContain('importPlan.dealerSourceIds.join(", ")');
    expect(source).not.toContain('importPlan.mismatchedSourceIds.join(", ")');
  });

  it("keeps the Sources introduction focused on buyer decisions, not operations", () => {
    const source = read("app/(dashboard)/sources/page.tsx");

    expect(source).toContain("Market coverage");
    expect(source).toContain(
      "Choose where you want to find your next vehicle.",
    );
    expect(source).toContain("Live coverage available");
    expect(source).toContain("Available market coverage");
    expect(source).toContain("Independent dealer coverage");
    expect(source).not.toContain(
      "Connect one lane, import rows, then Scan becomes useful.",
    );
    expect(source).not.toContain("Configure credentials");
    expect(source).not.toContain("Scraper Coverage");
    expect(source).not.toContain("smart fan-out runner");
    expect(source).not.toContain("shared dealer import");
    expect(source).toContain('label: "Checking listings"');
    expect(source).toContain('label: "Search this market"');
    expect(source).toContain("researched dealer option");
    expect(source).toContain("state dealer research appears");
  });

  it("does not let setup be skipped and keeps Discover on the saved buyer scope", () => {
    const onboarding = read("app/onboarding/page.tsx");
    const discover = read("app/(dashboard)/discover/page.tsx");
    const middleware = read("middleware.ts");

    expect(onboarding).not.toContain("Set up later");
    expect(onboarding).not.toContain('router.push("/discover")');
    expect(discover).toContain("savedBuyerScope");
    expect(discover).toContain("normalizeBuyerIntent(prefs.buyerScope)");
    expect(middleware).toContain("user_profiles");
    expect(middleware).toContain("onboarded");
    expect(middleware).toContain('url.pathname = "/onboarding"');
  });
});
