import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOBILE_PRIMARY,
  MORE_GROUPS,
  PRIMARY,
  navJobCoverage,
  navItemMatchesPath,
  primaryJobForPath,
} from "@/components/layout/nav-items";

describe("primaryJobForPath", () => {
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
        { name: "Sources", href: "/sources", icon: (() => null) as any },
        "/sources?sellerType=dealer",
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
      "Sources",
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
    expect(discoverPage).toContain("Refine search");
    expect(discoverPage).not.toContain("<BuyerScopeBuilder");
    expect(discoverPage).not.toContain("<SetupStatusPanel");
  });
});
