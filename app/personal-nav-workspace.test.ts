import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  accountMenuForMode,
  primaryNavForMode,
} from "@/components/layout/nav-items";

const hrefs = (mode: unknown) =>
  accountMenuForMode(mode).tools.map((tool) => tool.href);

describe("personal buyer nav and workspace", () => {
  it("personal tools drop Dealer network and Flash deals; flip desks keep them", () => {
    for (const mode of ["personal", undefined]) {
      expect(hrefs(mode)).not.toContain("/dealer-network");
      expect(hrefs(mode)).not.toContain("/flash-deals");
    }
    for (const mode of ["dealer", "reseller"]) {
      expect(hrefs(mode)).toContain("/dealer-network");
      expect(hrefs(mode)).toContain("/flash-deals");
    }
  });

  it("onboarding 'Your workspace' reads the same mode-filtered tools", () => {
    const onboarding = readFileSync("app/onboarding/page.tsx", "utf8");
    expect(onboarding).toContain("accountMenuForMode(buyerMode).tools.map(");
  });

  it("top nav calls /fleet 'Purchase plan' for personal, 'Pipeline' for dealer", () => {
    const fleet = (mode: unknown) =>
      primaryNavForMode(mode).find((item) => item.href === "/fleet")?.name;
    expect(fleet("personal")).toBe("Purchase plan");
    expect(fleet(undefined)).toBe("Purchase plan");
    expect(fleet("dealer")).toBe("Pipeline");
    expect(fleet("reseller")).toBe("Pipeline");
  });
});
