import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Today personal-buyer honesty", () => {
  const page = read("app/(dashboard)/today/page.tsx");

  it("gates the sold-flip calibration upsell to flip desks", () => {
    expect(page).toContain("{flipDesk && <CalibrationNudge />}");
    expect(page).not.toMatch(/^\s*<CalibrationNudge \/>/m);
  });

  it("does not claim live data — it is saved inventory", () => {
    expect(page).not.toContain('"live deals"');
    expect(page).not.toContain('"LIVE"');
    expect(page).not.toContain("every live listing");
    expect(page).toContain('"saved listings"');
  });

  it("ticker renders each stat once (no duplicated marquee clone)", () => {
    const ticker = read("components/home/DealTicker.tsx");
    expect(ticker).not.toContain("[...items, ...items]");
    expect(ticker).toContain("seen.has(key)");
  });
});

describe("Today mispricing rail is home-state scoped", () => {
  const page = read("app/(dashboard)/today/page.tsx");
  it("passes the saved home state to /api/mispricing after prefs load", () => {
    expect(page).not.toContain('endpoint="/api/mispricing"');
    expect(page).toContain("effectiveHome(prefs)?.state");
    expect(page).toContain("`/api/mispricing${homeState ? `?state=");
    expect(page).toMatch(/\{!prefsLoading && \(\s*<IntelRail\s+endpoint=\{mispricingEndpoint\}/);
  });
});
