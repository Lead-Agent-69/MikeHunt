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
    expect(page).toContain("Quick filters");
    expect(page).toContain("Search cars");
    expect(page).toContain("All filters & results");
    expect(page).toContain('aria-label="Browse inventory"');
    expect(page).toContain("href={`/scan${scopeQuery}`}");
    expect(page).toContain("selectedStates,");
  });
  it("keeps mileage and source controls outside the additional filters disclosure", () => {
    const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    const primaryStart = scan.indexOf("{/* Model cascades");
    const additionalStart = scan.indexOf("{/* ADVANCED:");
    const primary = scan.slice(primaryStart, additionalStart);
    expect(primary).toContain('label="Max Miles"');
    expect(primary).toContain('label="Source"');
    expect(primary).toContain("aria-expanded={showMore}");
    expect(primary).toContain('aria-controls="additional-inventory-filters"');
    expect(primary).toContain("Year, distance & condition");
    expect(scan).toContain(
      '<details open className="glass-panel px-4 py-3 space-y-3">',
    );
    expect(scan.match(/label="Max Miles"/g)).toHaveLength(1);
    expect(scan.match(/label="Source"/g)).toHaveLength(1);
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
    expect(page).toContain("return observeScrollEdges(element, setEdges)");
    expect(page).toContain("scroll-px-4");
    expect(page).toContain("md:scroll-px-6");
    expect(page).toContain('behavior: reducedMotion ? "instant" : "smooth"');
  });

  it("retains estimates in disclosure, allows long names and avoids hover motion when reduced", () => {
    expect(card).not.toContain("framer-motion");
    expect(card).toContain("discovery-card w-");
    expect(card).toContain('data-testid="discovery-card-price-preview"');
    expect(card).toContain("{displayPrice}");
    expect(card).toContain('decoding="async"');
    expect(card).not.toContain("backdropFilter");
    expect(card).not.toContain("whileInView");
    expect(card).not.toMatch(/<motion.div\s+layout/);
    expect(page).not.toContain("motion.section");
    const inventory = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    expect(inventory).toContain("<div className={gridClass}>");
    expect(inventory).not.toContain("staggerChildren: 0.06");
    expect(card).toContain("Cost estimates and source details");
    expect(card.replace(/\s+/g, " ")).toContain(
      "not inspection findings or guaranteed sale prices",
    );
    expect(card).toContain("break-words");
    const css = readFileSync("app/globals.css", "utf8");
    expect(css).toContain(".discovery-card .interactive-surface:hover");
    expect(card).toContain(
      'external ? "View source listing" : "Review vehicle"',
    );
  });
});
