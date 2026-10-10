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
  navItemIsActive,
  primaryJobForPath,
  scanHrefForMode,
  accountMenuForMode,
} from "@/components/layout/nav-items";

describe("primaryJobForPath", () => {
  it("keeps navigation accessible and exposes mobile auction and activity entry points", () => {
    const top = readFileSync("components/layout/TopNav.tsx", "utf8");
    const dock = readFileSync("components/BottomNav.tsx", "utf8");
    const account = readFileSync("components/home/AccountMenu.tsx", "utf8");
    expect(top).toContain('aria-current={active ? "page" : undefined}');
    expect(dock).toContain("useReducedMotion");
    expect(dock).toContain("env(safe-area-inset-bottom)");
    expect(account).toContain("accountMenuForMode(intent?.buyerMode)");
    expect(
      accountMenuForMode("personal").primary.map((entry) => entry.href),
    ).toContain("/alerts");
    expect(
      accountMenuForMode("dealer").tools.map((entry) => entry.href),
    ).toContain("/lane");
  });
  it("keeps secondary pages under the five main jobs", () => {
    expect(primaryJobForPath("/")).toBe("Discover");
    expect(primaryJobForPath("/feed")).toBe("Discover");
    expect(primaryJobForPath("/find")).toBe("Discover");
    expect(primaryJobForPath("/scan")).toBe("Discover");
    expect(primaryJobForPath("/deal/abc")).toBe("Discover");
    expect(primaryJobForPath("/overview/toyota/camry")).toBe("Discover");
    expect(primaryJobForPath("/dealer-network")).toBe("Discover");
    expect(primaryJobForPath("/dealer-network/aeofmiami.com")).toBe("Discover");
    expect(primaryJobForPath("/compare")).toBe("Saved");
    expect(primaryJobForPath("/alerts")).toBe("Saved");
    expect(primaryJobForPath("/searches")).toBe("Saved");
    expect(primaryJobForPath("/save")).toBe("Saved");
    expect(primaryJobForPath("/sources")).toBeNull();
    expect(primaryJobForPath("/status")).toBeNull();
    expect(primaryJobForPath("/fleet")).toBe("Pipeline");
    expect(primaryJobForPath("/move")).toBe("Pipeline");
    expect(primaryJobForPath("/finance")).toBeNull();
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
          href: "/dealer-network",
        },
        "/dealer-network/aeofmiami.com",
      ),
    ).toBe(true);
    expect(
      navItemMatchesPath({ href: "/discover" }, "/discover?state=FL"),
    ).toBe(false);
  });

  it("highlights the same workflow even when the personal label is Plan", () => {
    for (const mode of ["personal", "diy", "parts", "reseller", "dealer"]) {
      const tabs = primaryNavForMode(mode);
      for (const [path, href] of [
        ["/compare", "/saved"],
        ["/fleet", "/fleet"],
        ["/parts", "/fleet"],
        ["/dealer-network/shop", "/discover"],
        ["/searches", "/saved"],
      ]) {
        expect(
          tabs
            .filter((item) => navItemIsActive(item, path))
            .map((item) => item.href),
        ).toEqual([href]);
      }
    }
  });

  it("keeps the primary nav to the core buyer workflow", () => {
    expect(PRIMARY.map((item) => item.name)).toEqual([
      "Discover",
      "Saved",
      "Pipeline",
      "Auction Lane",
    ]);
    expect(MOBILE_PRIMARY.map((item) => item.name)).toEqual([
      "Discover",
      "Saved",
      "Pipeline",
      "Tools",
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
      "Deal Check",
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
      "/compare",
      "/deal/abc",
      "/deal-check",
      "/dealer-network",
      "/discover",
      "/feed",
      "/find",
      "/flash-deals",
      "/fleet",
      "/insights",
      "/lane",
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
    expect(discoverPage).toContain("Browse inventory");
    expect(discoverPage).not.toContain("<BuyerScopeBuilder");
    expect(discoverPage).not.toContain("<SetupStatusPanel");
  });

  it("keeps purchase planning but drops auction and arbitrage tabs for non-flip desks", () => {
    for (const mode of ["personal", "diy", "parts"]) {
      expect(hidesFlipNav(mode)).toBe(true);
      expect(primaryNavForMode(mode).map((item) => item.name)).toEqual([
        "Discover",
        "Saved",
        mode === "personal" ? "Purchase plan" : "Plan",
      ]);
      expect(mobileNavForMode(mode).map((item) => item.name)).toEqual([
        "Discover",
        "Saved",
        "Plan",
        "Tools",
      ]);
      const more = moreGroupsForMode(mode).flatMap((group) =>
        group.items.map((item) => item.href),
      );
      expect(more).not.toContain("/auctions");
      expect(more).not.toContain("/arbitrage");
      expect(more).toContain("/parts");
    }
  });

  it("keeps the full nav for flip desks only", () => {
    for (const mode of ["reseller", "dealer"]) {
      expect(hidesFlipNav(mode)).toBe(false);
      expect(primaryNavForMode(mode)).toBe(PRIMARY);
      expect(mobileNavForMode(mode)).toBe(MOBILE_PRIMARY);
      expect(moreGroupsForMode(mode)).toBe(MORE_GROUPS);
    }
  });

  it("treats an unknown mode (signed out, no prefs) as personal", () => {
    for (const mode of [undefined, null, "", "unknown"]) {
      expect(hidesFlipNav(mode)).toBe(true);
      const top = primaryNavForMode(mode).map((item) => item.href);
      const mobile = mobileNavForMode(mode).map((item) => item.href);
      expect(top).toEqual(
        primaryNavForMode("personal").map((item) => item.href),
      );
      expect(mobile).toEqual(
        mobileNavForMode("personal").map((item) => item.href),
      );
      expect(top).not.toContain("/lane");
      expect(top).toContain("/fleet");
      expect(mobile).toContain("/fleet");
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

  it("keeps the account menu's Auction Lane shortcut off non-flip desks", () => {
    for (const mode of ["personal", "diy", "parts", undefined]) {
      expect(
        accountMenuForMode(mode).tools.map((entry) => entry.href),
      ).not.toContain("/lane");
    }
  });
});

describe("scanHrefForMode", () => {
  it("sorts Scan by profit only for flip desks", () => {
    expect(scanHrefForMode("reseller")).toBe("/scan?sort=profit");
    expect(scanHrefForMode("dealer")).toBe("/scan?sort=profit");
    for (const mode of ["personal", "diy", "parts", undefined, ""]) {
      expect(scanHrefForMode(mode)).toBe("/scan?sort=score");
    }
  });
});

describe("alerts page", () => {
  const source = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");

  it("uses buyer-facing copy instead of internal scraper jargon", () => {
    expect(source).not.toMatch(/Scrape Inbox/);
    expect(source).not.toMatch(/account sync is being/);
    expect(source).toMatch(/No alerts yet/);
  });

  it("routes Scan by buyer mode and hides profit targets for non-flip desks", () => {
    expect(source).not.toContain('href="/scan?sort=profit"');
    expect(source).toContain("scanHrefForMode(intent?.buyerMode)");
    expect(source).toContain("showProfitTarget && search.target_profit");
  });

  it("keeps the dismiss control reachable on touch screens", () => {
    expect(source).not.toMatch(
      /"absolute -top-3 -right-3 z-20 opacity-0 group-hover/,
    );
    expect(source).toContain('aria-label="Dismiss alert"');
  });
});
