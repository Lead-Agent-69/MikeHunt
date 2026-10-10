import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  "components/deal/FreightAndTaxCalculator.tsx",
  "utf8",
);
const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");

describe("transport card", () => {
  it("transport planning never publishes invented bundle savings or title approval", () => {
    const move = readFileSync("app/(dashboard)/move/page.tsx", "utf8");
    expect(move).not.toContain("MultiCarTrailerOptimizer");
    expect(move).not.toContain("Clean Transfer");
    expect(move).not.toContain("tierQuote");
    expect(move).toContain('data?.mode === "road"');
    expect(move).toContain("This is not a carrier quote");
    expect(move).toContain("Title transfer eligibility has not been verified");
  });
  it("has no hard-coded mileage, rates, tax or DMV fees", () => {
    expect(source).not.toMatch(/1380|0\.75|1\.15|0\.0725|0\.0625|385|58500/);
    expect(source).not.toMatch(/salesTax|titleRegFee|totalLandedCost/);
  });

  it("shows numbers only for a road-routed quote from /api/transport/quote", () => {
    expect(source).toContain("/api/transport/quote?from=");
    expect(source).toContain('data.mode === "road"');
    expect(source).toContain("Get a transport quote");
  });

  it("the deal page passes the real listing state and the buyer's home state", () => {
    expect(page).not.toContain('buyState={serverDeal.locationState ?? "TX"}');
    expect(page).toContain("homeState={effectiveHome(prefs)?.state}");
  });
});
