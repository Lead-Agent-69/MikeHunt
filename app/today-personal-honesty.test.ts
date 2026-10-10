import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Today personal-buyer honesty", () => {
  const page = read("app/(dashboard)/today/page.tsx");

  it("redirects the retired duplicate desk instead of presenting a calibration upsell", () => {
    expect(page).toContain("redirect(`/discover");
    expect(page).not.toContain("CalibrationNudge");
  });

  it("does not claim live data — it is saved inventory", () => {
    expect(page).not.toContain('"live deals"');
    expect(page).not.toContain('"LIVE"');
    expect(page).not.toContain("every live listing");
    expect(page).not.toContain("IntelRail");
  });

  it("ticker renders each stat once (no duplicated marquee clone)", () => {
    const ticker = read("components/home/DealTicker.tsx");
    expect(ticker).not.toContain("[...items, ...items]");
    expect(ticker).toContain("seen.has(key)");
  });
});

describe("Today mispricing rail is home-state scoped", () => {
  const page = read("app/(dashboard)/today/page.tsx");
  it("preserves incoming buyer scope when redirecting to Discover", () => {
    expect(page).toContain("Object.entries(await searchParams)");
    expect(page).toContain("params.append(key, item)");
    expect(page).toContain("params.toString()");
  });
});
