import { describe, expect, it } from "vitest";
import { workspaceIsExpanded } from "./workspace";
import { workspaceGroupsForMode } from "@/components/layout/nav-items";
describe("intentional workspace", () => {
  it("defaults to focused except dealers; never turns a workspace into a role", () => {
    for (const mode of ["personal", "diy", "parts", "reseller", undefined]) {
      expect(workspaceIsExpanded(mode)).toBe(false);
      expect(workspaceIsExpanded(mode, "expanded")).toBe(true);
    }
    expect(workspaceIsExpanded("dealer", "focused")).toBe(true);
    expect(workspaceIsExpanded("admin", "admin")).toBe(false);
  });
  it("reduces alternate views while preserving the core and all dealer tools", () => {
    const hrefs = (mode: string, expanded: boolean) =>
      workspaceGroupsForMode(mode, expanded).flatMap((g) =>
        g.items.map((i) => i.href.split("?")[0]),
      );
    expect(hrefs("personal", false)).toEqual(
      expect.arrayContaining([
        "/discover",
        "/scan",
        "/map",
        "/saved",
        "/compare",
        "/fleet",
        "/deal-check",
        "/upgrade",
      ]),
    );
    expect(hrefs("personal", false)).not.toContain("/swipe");
    expect(hrefs("personal", true)).toContain("/swipe");
    for (const mode of ["personal", "diy", "parts", "reseller", "dealer"]) {
      for (const expanded of [false, true])
        expect(hrefs(mode, expanded)).not.toContain("/admin");
    }
    expect(hrefs("dealer", true)).toContain("/finance");
    expect(hrefs("dealer", true)).toContain("/bulk");
  });
});
