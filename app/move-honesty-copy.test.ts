import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

// Unified (master #172 + main 3701026): main's road-route-only transport page, plus
// master's home-state default instead of an invented route.
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
    expect(page).toContain("data.miles > 0");
    expect(page).toContain('data?.mode === "road"');
    expect(page).toContain("Enter a route to see transport estimates.");
    expect(page).not.toMatch(/isSameState\s*\?\s*150/);
  });

  it("uses estimate wording, not instant/live", () => {
    expect(page).not.toMatch(/Instant transport quotes/);
    expect(page).not.toContain("● live route");
    expect(page).toContain("planning estimate");
    expect(page).toContain("This is not a carrier quote");
  });

  it("publishes no flip-profit copy on the move page", () => {
    expect(page).not.toContain("Pro tip");
    expect(page).not.toContain("Deal Analyzer profit");
    expect(optimizer).not.toMatch(/of your flip profit/);
  });
});
