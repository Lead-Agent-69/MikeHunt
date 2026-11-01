import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const luminance = (hex: string) => {
  const rgb = [0, 2, 4]
    .map((offset) => parseInt(hex.slice(offset + 1, offset + 3), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
describe("inventory primary-action contrast", () => {
  it.each([
    ["accent", "#075be8", "on-accent", "#ffffff"],
    ["accent", "#8eb6ff", "on-accent", "#07111f"],
    ["accent-surface", "#edf3ff", "blue", "#075be8"],
    ["accent-surface", "#21354d", "blue", "#8eb6ff"],
  ])(
    "keeps %s %s / %s %s readable",
    (backgroundToken, background, foregroundToken, foreground) => {
      const css = readFileSync("app/globals.css", "utf8");
      expect(css).toContain(`--${backgroundToken}: ${background}`);
      expect(css).toContain(`--${foregroundToken}: ${foreground}`);
      const a = luminance(background),
        b = luminance(foreground);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
  it.each([
    "components/feed/FeedVehicleCard.tsx",
    "components/search/QuickVehicleReview.tsx",
  ])("%s uses the matching foreground", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("bg-[var(--accent)]");
    expect(source).toContain("text-[var(--on-accent)]");
    expect(source).not.toContain("bg-[var(--blue)]");
  });
  it.each([
    "components/market/MarketLocation.tsx",
    "components/deal/VehicleSourceAction.tsx",
    "components/reco/SimilarInterestPrompt.tsx",
    "app/(dashboard)/discover/page.tsx",
    "components/market/MarketSearchActions.tsx",
    "components/search/VehicleSearchForm.tsx",
    "components/market/MarketQuickFilters.tsx",
    "components/search/ScrollSearchBar.tsx",
    "components/search/InventoryViewLinks.tsx",
    "app/(dashboard)/market/page.tsx",
    "components/settings/BuyingProfilePrefs.tsx",
    "app/(dashboard)/recon/page.tsx",
    "components/deal/ReportListing.tsx",
    "app/(dashboard)/fleet/page.tsx",
  ])("%s keeps primary controls readable in both themes", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).toContain("bg-[var(--accent)]");
    expect(source).toContain("text-[var(--on-accent)]");
    expect(source).not.toMatch(
      /bg-\[var\(--blue\)\][^"]*text-white|text-white[^"]*bg-\[var\(--blue\)\]/,
    );
  });
  it("keeps the Discover tonal action paired with its contrasting foreground", () => {
    const source = readFileSync(
      "components/discovery/DiscoveryCard.tsx",
      "utf8",
    );
    const action = source.slice(source.lastIndexOf("<Link"));
    expect(action).toContain("bg-[var(--accent-surface)]");
    expect(action).toContain("text-[var(--blue)]");
    expect(action).toContain("min-h-11");
    expect(action).not.toContain("hover:opacity-");
  });
});
