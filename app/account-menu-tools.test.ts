import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountMenuForMode } from "@/components/layout/nav-items";

const names = (entries: { name: string }[]) => entries.map((e) => e.name);
const all = (mode: unknown) => {
  const menu = accountMenuForMode(mode);
  return [...menu.primary, ...menu.tools, ...menu.secondary];
};

describe("account menu", () => {
  it("personal: Saved, Saved searches, Alerts, Tools (Scan), Settings, Help", () => {
    const menu = accountMenuForMode("personal");
    expect(names(menu.primary)).toEqual(["Saved", "Saved searches", "Alerts"]);
    expect(names(menu.tools)).toEqual(["Scan listings"]);
    expect(menu.tools[0].href).toBe("/scan?sort=score");
    expect(names(menu.secondary)).toEqual(["Settings", "Help & updates"]);
  });

  it("unknown mode is treated as personal", () => {
    expect(accountMenuForMode(undefined)).toEqual(
      accountMenuForMode("personal"),
    );
  });

  it("parts and diy add Parts but no flip tools", () => {
    for (const mode of ["parts", "diy"]) {
      expect(names(accountMenuForMode(mode).tools)).toEqual([
        "Scan listings",
        "Parts",
      ]);
    }
  });

  it("reseller and dealer add Parts, Dealer network and Auction Lane", () => {
    for (const mode of ["reseller", "dealer"]) {
      const tools = accountMenuForMode(mode).tools;
      expect(names(tools)).toEqual([
        "Scan listings",
        "Parts",
        "Dealer network",
        "Auction Lane",
      ]);
      expect(tools[0].href).toBe("/scan?sort=profit");
    }
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
    expect(source).toMatch(/\{!signedOut && \(/);
  });

  it("the old More menu stays removed", () => {
    const top = readFileSync("components/layout/TopNav.tsx", "utf8");
    expect(top).not.toContain("More dropdown");
    expect(top).not.toContain("moreGroupsForMode");
  });
});
