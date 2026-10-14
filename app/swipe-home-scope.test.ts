import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Swipe home-state scope", () => {
  const page = read("app/(dashboard)/swipe/page.tsx");

  it("scopes the queue to the saved home state", () => {
    expect(page).toContain("usePreferences");
    expect(page).toContain("effectiveHome(prefs)");
    expect(page).toContain('params.set("state", homeState)');
    expect(page).toContain('params.get("scope") !== "explicit"');
    expect(page).toContain('!params.has("states")');
    expect(page).not.toContain("&location=");
  });

  it("waits for prefs before fetching (no nationwide flash)", () => {
    expect(page).toMatch(/swipeReady\s*\n?\s*\?\s*`\/api\/scan/);
    expect(page).toContain("keepPreviousData: false");
    expect(page).toContain("Loading your home state…");
    expect(page).not.toContain("best-scored deals first");
  });
});

describe("Swipe buyer-mode gating + labels", () => {
  const page = read("app/(dashboard)/swipe/page.tsx");

  it("hides flip economics outside reseller/dealer desks", () => {
    expect(page).toMatch(/<SwipeVehicleFace\s+deal=\{d\}/);
    const face = read("components/search/SwipeVehicleFace.tsx");
    expect(face).not.toContain("deal.sellEstimate");
    expect(face).not.toContain("deal.recommendedMaxBid");
    expect(face).not.toContain("deal.profitEstimate");
  });

  it("renders human source/condition labels, not raw enums", () => {
    const face = read("components/search/SwipeVehicleFace.tsx");
    expect(face).toContain("sourceLabel(deal.source, deal.sourceUrl)");
    expect(face).toContain("<TitleBadge");
    expect(face).not.toContain(
      '<span className="capitalize">{deal.condition}</span>',
    );
    expect(face).not.toContain("{deal.source}</span>");
  });
});
