import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
const card = readFileSync("components/discovery/DiscoveryCard.tsx", "utf8");

describe("discovery browsing presentation safeguards", () => {
  it("uses the header location scope and offers the complete matching inventory", () => {
    expect(page).not.toContain('aria-label="State"');
    expect(page).not.toContain("stateDraft");
    expect(page).toContain("View all matching vehicles");
    expect(page).toContain("href={`/scan${scopeQuery}`}");
    expect(page).toContain("selectedStates,");
  });
  it("mounts secondary market requests only when insights are opened", () => {
    expect(page).toContain("showInsights &&");
    expect(page).toContain("setShowInsights(event.currentTarget.open)");
    expect(page).toContain("Market insights and saved interests");
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
