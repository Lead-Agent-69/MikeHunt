import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOBILE_PRIMARY,
  MORE_GROUPS,
  PRIMARY,
  navJobCoverage,
  hidesFlipNav,
  mobileNavForMode,
  moreGroupsForMode,
  primaryNavForMode,
  navItemMatchesPath,
  primaryJobForPath,
} from "@/components/layout/nav-items";

describe("primaryJobForPath", () => {
  it("keeps navigation accessible and exposes mobile auction and activity entry points", () => {
    const top = readFileSync("components/layout/TopNav.tsx", "utf8");
    const dock = readFileSync("components/BottomNav.tsx", "utf8");
    const account = readFileSync("components/home/AccountMenu.tsx", "utf8");
    expect(top).toContain('aria-current={active ? "page" : undefined}');
    expect(dock).toContain("useReducedMotion");
    expect(dock).toContain("env(safe-area-inset-bottom)");
    expect(account).toContain('router.push("/alerts")');
    expect(account).toContain('router.push("/lane")');
  });
  it("keeps secondary pages under the five main jobs", () => {
    expect(primaryJobForPath("/")).toBe("Discover");
    expect(primaryJobForPath("/feed")).toBe("Discover");
    expect(primaryJobForPath("/find")).toBe("Discover");
    expect(primaryJobForPath("/scan")).toBe("Discover");
    expect(primaryJobForPath("/deal/abc")).toBe("Discover");
    expect(primaryJobForPath("/overview/toyota/camry")).toBe("Discover");
    expect(primaryJobForPath("/dealer-network")).toBe("Saved");
    expect(primaryJobForPath("/dealer-network/aeofmiami.com")).toBe("Saved");
    expect(primaryJobForPath("/alerts")).toBe("Saved");
    expect(primaryJobForPath("/searches")).toBe("Saved");
    expect(primaryJobForPath("/save")).toBe("Saved");
    expect(primaryJobForPath("/sources")).toBeNull();
    expect(primaryJobForPath("/status")).toBeNull();
    expect(primaryJobForPath("/fleet")).toBe("Pipeline");
    expect(primaryJobForPath("/move")).toBe("Pipeline");
    expect(primaryJobForPath("/finance")).toBe("Pipeline");
    expect(primaryJobForPath("/best-buy")).toBe("Discover");
    expect(primaryJobForPath("/market")).toBe("Discover");
    expect(primaryJobForPath("/deal-check")).toBe("Deal Check");
    expect(primaryJobForPath("/lane")).toBe("Auction Lane");
    expect(primaryJobForPath("/auctions")).toBe("Auction Lane");
  });

  it("matches nested nav item routes for active menu state", () => {
    expect(
      navItemMatchesPath(
        {
          name: "Dealer network",
          href: "/dealer-network",
          icon: (() => null) as any,
        },
        "/dealer-network/aeofmiami.com",
      ),
    ).toBe(true);
    expect(
      navItemMatchesPath(
        { name: "Discover", href: "/discover", icon: (() => null) as any },
        "/discover?state=FL",
      ),
    ).toBe(false);
  });

  it("keeps the primary nav to the core buyer workflow", () => {
    expect(PRIMARY.map((item) => item.name)).toEqual([
      "Discover",
      "Deal Check",
      "Auction Lane",
      "Pipeline",
      "Saved",
    ]);
    expect(MOBILE_PRIMARY.map((item) => item.name)).toEqual([
      "Discover",
      "Deal Check",
      "Saved",
      "Pipeline",
      "Account",
    ]);

    const coverage = navJobCoverage();
    expect(Array.from(coverage.keys()).sort()).toEqual([
      "Auction Lane",
      "Deal Check",
      "Discover",
      "Pipeline",
      "Saved",
    ]);
    expect(coverage.get("Discover")?.length).toBeGreaterThan(1);
    expect(coverage.get("Auction Lane")?.length).toBeGreaterThan(1);
    expect(coverage.get("Pipeline")?.length).toBeGreaterThan(1);
    expect(coverage.get("Saved")?.length).toBeGreaterThan(1);
    expect(coverage.get("Deal Check")?.length).toBe(1);
  });

  it("does not duplicate routes across primary and grouped navigation", () => {
    const allHrefs = [
      ...PRIMARY.map((item) => item.href),
      ...MORE_GROUPS.flatMap((group) => group.items.map((item) => item.href)),
    ];
    const duplicates = allHrefs.filter(
      (href, index) => allHrefs.indexOf(href) !== index,
    );

    expect(duplicates).toEqual([]);
  });

  it("keeps secondary user pages tucked under job groups or account", () => {
    const allowedGroups = new Set([
      "Discover",
      "Discover collections",
      "Market",
      "Auction Lane",
      "Pipeline",
      "Saved",
      "Account",
    ]);
    expect(MORE_GROUPS.every((group) => allowedGroups.has(group.group))).toBe(
      true,
    );
  });

  it("classifies the normal dashboard route inventory into a job", () => {
    const userRoutes = [
      "/alerts",
      "/arbitrage",
      "/auctions",
      "/best-buy",
      "/bulk",
      "/compare",
      "/deal/abc",
      "/deal-check",
      "/dealer-network",
      "/discover",
      "/feed",
      "/finance",
      "/find",
      "/flash-deals",
      "/fleet",
      "/insights",
      "/lane",
      "/list",
      "/map",
      "/market",
      "/move",
      "/overview/ford/f-150",
      "/parts",
      "/recon",
      "/save",
      "/saved",
      "/scan",
      "/searches",
      "/swipe",
      "/today",
    ];

    expect(
      userRoutes.filter((route) => primaryJobForPath(route) == null),
    ).toEqual([]);
    expect(
      MORE_GROUPS.find((group) => group.group === "Account")?.items.map(
        (item) => item.href,
      ),
    ).toEqual(expect.arrayContaining(["/changelog"]));
  });

  it("keeps discover focused on listings instead of the search-planning workflow", () => {
    const discoverPage = readFileSync(
      "app/(dashboard)/discover/page.tsx",
      "utf8",
    );

    expect(discoverPage).toContain("Buying for");
    expect(discoverPage).toContain("View all matches & filters");
    expect(discoverPage).not.toContain("<BuyerScopeBuilder");
    expect(discoverPage).not.toContain("<SetupStatusPanel");
  });

  it("drops auction, pipeline, and arbitrage tabs for non-flip desks", () => {
    for (const mode of ["personal", "diy", "parts"]) {
      expect(hidesFlipNav(mode)).toBe(true);
      expect(primaryNavForMode(mode).map((item) => item.name)).toEqual([
        "Discover",
        "Deal Check",
        "Saved",
        "Alerts",
      ]);
      expect(mobileNavForMode(mode).map((item) => item.name)).toEqual([
        "Discover",
        "Deal Check",
        "Saved",
        "Alerts",
        "Account",
      ]);
      const more = moreGroupsForMode(mode).flatMap((group) =>
        group.items.map((item) => item.href),
      );
      expect(more).not.toContain("/auctions");
      expect(more).not.toContain("/arbitrage");
      expect(more).toContain("/parts");
    }
  });

  it("keeps the full nav for flip desks and an unknown mode", () => {
    for (const mode of ["reseller", "dealer", undefined, ""]) {
      expect(hidesFlipNav(mode)).toBe(false);
      expect(primaryNavForMode(mode)).toBe(PRIMARY);
      expect(mobileNavForMode(mode)).toBe(MOBILE_PRIMARY);
      expect(moreGroupsForMode(mode)).toBe(MORE_GROUPS);
    }
  });

  it("reads the saved buyer mode in both navs", () => {
    const top = readFileSync("components/layout/TopNav.tsx", "utf8");
    const bottom = readFileSync("components/BottomNav.tsx", "utf8");
    expect(top).toContain("primaryNavForMode(intent?.buyerMode)");
    expect(bottom).toContain("mobileNavForMode(intent?.buyerMode)");
    expect(top).not.toContain("{PRIMARY.map(");
    expect(bottom).not.toContain("{MOBILE_PRIMARY.map(");
  });
});
