import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("move page honesty", () => {
  const page = read("app/(dashboard)/move/page.tsx");
  const optimizer = read("components/transport/MultiCarTrailerOptimizer.tsx");

  it("does not default to an invented TX → CA route", () => {
    expect(page).not.toMatch(/: "TX";/);
    expect(page).not.toContain('useState("CA")');
    expect(page).toContain("usePreferences");
    expect(page).toContain("discoverHomeState(prefs.homeLocation");
  });

  it("never prices a 0-mile or unknown route", () => {
    expect(page).toContain("Number(result.miles) > 0");
    expect(page).toContain("Enter a route to see transport estimates.");
    expect(page).not.toMatch(/isSameState\s*\?\s*150/);
  });

  it("uses estimate wording, not instant/live", () => {
    expect(page).not.toMatch(/Instant transport quotes/);
    expect(page).not.toContain("● live route");
    expect(page).toContain("Transport cost estimates");
  });

  it("flip-profit copy is gated to flip desks", () => {
    expect(page).toContain("isFlipBuyerMode(intent?.buyerMode)");
    expect(page).toMatch(/flipDesk && hasRoute && result/);
    expect(page).toMatch(/flipDesk && \(/);
    expect(optimizer).not.toMatch(/of your flip profit/);
  });
});
