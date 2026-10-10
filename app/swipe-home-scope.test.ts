import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Swipe home-state scope", () => {
  const page = read("app/(dashboard)/swipe/page.tsx");

  it("scopes the queue to the saved home state", () => {
    expect(page).toContain("usePreferences");
    expect(page).toContain("effectiveHome(prefs)");
    expect(page).toContain("&state=");
    expect(page).not.toContain("&location=");
  });

  it("waits for prefs before fetching (no nationwide flash)", () => {
    expect(page).toMatch(/swipeReady\s*\n?\s*\?\s*`\/api\/deals/);
    expect(page).toContain("keepPreviousData: false");
    expect(page).toContain("Loading your home state…");
    expect(page).not.toContain("best-scored deals first");
  });
});

describe("Swipe buyer-mode gating + labels", () => {
  const page = read("app/(dashboard)/swipe/page.tsx");

  it("hides flip economics outside reseller/dealer desks", () => {
    expect(page).toContain("isFlipBuyerMode(");
    expect(page).toMatch(
      /flipDesk &&\s*\(deal\.sellEstimate \|\| deal\.recommendedMaxBid\)/,
    );
    expect(page).toMatch(/\{flipDesk \? \(\s*<div className="text-right">/);
  });

  it("renders human source/condition labels, not raw enums", () => {
    expect(page).toContain("sourceMeta(deal.source).label");
    expect(page).toContain("readCondition(deal.condition");
    expect(page).not.toContain(
      '<span className="capitalize">{deal.condition}</span>',
    );
    expect(page).not.toContain("{deal.source}</span>");
  });
});
