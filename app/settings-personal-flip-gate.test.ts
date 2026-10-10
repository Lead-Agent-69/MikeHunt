import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const settings = readFileSync("app/(dashboard)/settings/page.tsx", "utf8");

describe("Settings hides dealer sections from personal buyers", () => {
  it("signed-in mode comes from saved prefs, not a stale local desk", () => {
    expect(settings).toMatch(
      /const savedBuyerMode = authed\s*\?\s*prefs\?\.buyerScope\?\.buyerMode\s*:\s*intent\?\.buyerMode;/,
    );
    expect(settings).not.toMatch(/intent\?\.buyerMode \|\| prefs/);
  });

  it("flip sections wait for prefs and are gated on the flip desk", () => {
    expect(settings).toContain("!prefsLoading && isFlipBuyerMode(savedBuyerMode)");
    expect(settings).toMatch(
      /\{showProfitTarget \? "Business profile" : "Contact details"\}/,
    );
    expect(settings).toMatch(
      /\{\/\* Dealer Defaults Section \*\/\}\s*\{showProfitTarget && \(/,
    );
  });
});
