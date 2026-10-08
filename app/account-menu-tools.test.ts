import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  accountMenuForMode,
  MORE_GROUPS,
  workspaceGroupsForMode,
} from "@/components/layout/nav-items";

const names = (entries: { name: string }[]) => entries.map((e) => e.name);
const all = (mode: unknown) => {
  const menu = accountMenuForMode(mode);
  return [...menu.primary, ...menu.tools, ...menu.secondary];
};

describe("account menu", () => {
  it("Tools exposes each role's full catalog without administrative privileges", () => {
    for (const mode of ["personal", "diy", "parts", "reseller", "dealer"]) {
      const groups = workspaceGroupsForMode(mode);
      const hrefs = groups.flatMap((group) =>
        group.items.map((item) => item.href),
      );
      expect(hrefs).toContain("/discover");
      for (const entry of all(mode)) expect(hrefs).toContain(entry.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
      expect(hrefs).not.toContain("/admin");
      expect(hrefs).not.toContain("/sources");
      expect(hrefs.includes("/insights")).toBe(
        mode === "dealer" || mode === "reseller",
      );
    }
    expect(workspaceGroupsForMode("parts")[0].group).toBe("Plan");
  });
  it("personal: Saved, Saved searches, Alerts, Tools (Scan), Settings, Help", () => {
    const menu = accountMenuForMode("personal");
    expect(names(menu.primary)).toEqual(["Saved", "Saved searches", "Alerts"]);
    expect(names(menu.tools)).toEqual([
      "Scan listings",
      "Feed",
      "Map",
      "Swipe",
      "Dealer network",
      "Today",
      "Flash deals",
      "Deal Check",
      "Compare",
      "Purchase plan",
      "Transport",
    ]);
    expect(menu.tools[0].href).toBe("/scan?sort=score");
    expect(names(menu.secondary)).toEqual([
      "Settings",
      "Upgrade",
      "Help & updates",
    ]);
  });

  it("unknown mode is treated as personal", () => {
    expect(accountMenuForMode(undefined)).toEqual(
      accountMenuForMode("personal"),
    );
  });
  it("dealers can reach every catalogued user tool, without admin privileges", () => {
    const hrefs = all("dealer").map((entry) => entry.href.split("?")[0]);
    for (const group of MORE_GROUPS)
      for (const tool of group.items) expect(hrefs).toContain(tool.href);
  });

  it("parts and diy add Parts but no flip tools", () => {
    for (const mode of ["parts", "diy"]) {
      const menu = accountMenuForMode(mode);
      expect(names(menu.tools)).toEqual(
        expect.arrayContaining([
          ...names(accountMenuForMode("personal").tools),
          "Parts",
          "Recon",
        ]),
      );
      expect(menu.tools[0].name).toBe(mode === "parts" ? "Parts" : "Recon");
      expect(menu.tools.some((tool) => tool.group === "Business")).toBe(false);
    }
  });

  it("reseller and dealer add Feed/Map/Swipe/Auctions plus flip tools", () => {
    for (const mode of ["reseller", "dealer"]) {
      const tools = accountMenuForMode(mode).tools;
      expect(tools.map((t) => t.href)).toEqual(
        expect.arrayContaining([
          "/scan?sort=profit",
          "/parts",
          "/feed",
          "/map",
          "/swipe",
          "/auctions",
          "/dealer-network",
          "/lane",
          "/market",
          "/arbitrage",
          "/find",
          "/best-buy",
          "/list",
          "/bulk",
          "/finance",
          "/recon",
          "/move",
          "/compare",
          "/insights",
          "/fleet",
          "/deal-check",
        ]),
      );
      expect(new Set(tools.map((tool) => tool.href)).size).toBe(tools.length);
    }
  });

  it("personal desk can browse every retail surface without business-only tools", () => {
    const hrefs = accountMenuForMode("personal").tools.map((t) => t.href);
    expect(hrefs).toContain("/feed");
    expect(hrefs).toContain("/map");
    expect(hrefs).toContain("/swipe");
    expect(hrefs).not.toContain("/auctions");
    expect(hrefs).not.toContain("/market");
    expect(hrefs).not.toContain("/finance");
  });

  it("never offers admin, and labels stay buyer-neutral", () => {
    for (const mode of ["personal", "diy", "parts", "reseller", "dealer"]) {
      for (const entry of all(mode)) {
        expect(entry.href).not.toMatch(/^\/admin/);
        expect(entry.name).not.toMatch(/admin/i);
        expect(entry.name).not.toMatch(/profit|candidate|inventory/i);
      }
    }
    const source = readFileSync("components/home/AccountMenu.tsx", "utf8");
    expect(source).not.toMatch(/\/admin/);
  });

  it("signed-out visitors get Sign in and Help, not Log out", () => {
    const source = readFileSync("components/home/AccountMenu.tsx", "utf8");
    expect(source).toContain("const signedOut = !authLoading && !dealerId;");
    expect(source).toContain('{ name: "Sign in", href: "/login" }');
    expect(source).toContain("!signedOut && !authLoading");
  });

  it("the old More menu stays removed", () => {
    const top = readFileSync("components/layout/TopNav.tsx", "utf8");
    expect(top).not.toContain("More dropdown");
    expect(top).not.toContain("moreGroupsForMode");
  });
});
