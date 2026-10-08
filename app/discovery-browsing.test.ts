import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
const card = readFileSync("components/discovery/DiscoveryCard.tsx", "utf8");

describe("discovery browsing presentation safeguards", () => {
  it("keeps multi-state scope in inventory, facets, and collection planning", () => {
    const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    const facets = readFileSync("app/api/scan/facets/route.ts", "utf8");
    expect(scan).toContain('const statesParam = urlParams.get("states")');
    expect(scan.match(/params.set\("states", selectedStates\)/g)).toHaveLength(
      2,
    );
    expect(scan).toContain("states: selectedStates || undefined");
    expect(scan).toContain('setSelectedStates("")');
    expect(facets).toContain('query.in("location_state", selectedStates)');
  });
  it("uses the header location scope and offers the complete matching inventory", () => {
    expect(page).not.toContain('aria-label="State"');
    expect(page).not.toContain("stateDraft");
    expect(page).toContain("Browse inventory");
    expect(page).toContain("href={`/scan${scopeQuery}`}");
    expect(page).toContain("selectedStates,");
  });
  it("mounts secondary market requests only when insights are opened", () => {
    expect(page).toContain("showInsights &&");
    expect(page).toContain("setShowInsights(event.currentTarget.open)");
    expect(page).toContain("Market insights and saved interests");
  });
  it("does not submit or navigate an incomplete account scope during hydration", () => {
    expect(page).toContain("if (!discoverReady) return;");
    expect(page).toContain("disabled={!discoverReady}");
    expect(page).toContain("{discoverReady && (");
  });

  it("provides labeled carousel controls and cleans up scroll observers", () => {
    expect(page).toContain("Previous vehicles in");
    expect(page).toContain("Next vehicles in");
    expect(page).toContain('event.key === "ArrowRight"');
    expect(page).toContain("disabled={edges.end}");
    expect(page).toContain("observer.disconnect()");
    expect(page).toContain('behavior: reducedMotion ? "instant" : "smooth"');
  });

  it("retains estimates in disclosure, allows long names and avoids hover motion when reduced", () => {
    expect(card).toContain("Cost estimates and source details");
    expect(card.replace(/\s+/g, " ")).toContain(
      "not inspection findings or guaranteed sale prices",
    );
    expect(card).toContain("break-words");
    expect(card).toContain("whileHover={reducedMotion ? undefined");
    expect(card).toContain(
      'external ? "View source listing" : "Review vehicle"',
    );
  });
});
