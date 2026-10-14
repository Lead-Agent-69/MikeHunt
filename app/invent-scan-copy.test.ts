import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("invent-scan copy honesty", () => {
  it("Flash empty does not invent a live scan or instant fill", () => {
    const page = read("app/(dashboard)/flash-deals/page.tsx");
    expect(page).not.toContain("Live feed active");
    expect(page).not.toMatch(/constantly scanning/i);
    expect(page).not.toMatch(/show up here instantly/i);
    expect(page).not.toMatch(/Act fast before they sell/i);
    expect(page).not.toMatch(/highest-margin/i);
    expect(page).toContain('"use client"');
    expect(page).toContain("/api/flash-deals");
    expect(page).toContain("DiscoveryCard");
    expect(page).not.toContain('from "@/components/shared/DealCard"');
    expect(page).toContain(
      "No qualifying price opportunities in indexed inventory for this location.",
    );
    expect(page).toContain('href: "/discover"');
  });

  it("Arbitrage load says loading saved listings, not scanning the market", () => {
    const page = read("app/(dashboard)/arbitrage/page.tsx");
    expect(page).not.toContain("Scanning the market");
    expect(page).toContain("Loading saved listings…");
  });

  it("Scan re-queries inventory without implying only personal saves or a live scrape", () => {
    const page = read("app/(dashboard)/scan/page.tsx");
    expect(page).toContain("Search inventory");
    expect(page).toContain("Updating inventory…");
    expect(page).toContain("No matching inventory for this search yet.");
    expect(page).not.toContain("Search saved inventory");
    expect(page).not.toContain("Scan Market");
    expect(page).not.toMatch(/animation:\s*"pulse-ring/);
    expect(page).toContain("Last loaded:");
  });

  it("FlashRail subtitle does not invent urgency", () => {
    const rail = read("components/discovery/FlashRail.tsx");
    expect(rail).not.toMatch(/moving fast/i);
    expect(rail).not.toMatch(/constantly scanning/i);
    expect(rail).not.toMatch(/show up here instantly/i);
    expect(rail).toContain(
      "Recently observed asking prices below a market estimate",
    );
    expect(rail).not.toContain("CountdownChip");
    expect(rail).not.toContain("secondsRemaining");
    expect(rail).toContain("Retry opportunities");
  });

  it("Find hub does not invent a live scanner or instant deals", () => {
    const page = read("app/(dashboard)/find/page.tsx");
    expect(page).not.toContain("Live Scanner");
    expect(page).not.toMatch(/local deals instantly/i);
    expect(page).toContain("Search inventory");
    expect(page).toContain("not a live market scan");
    expect(page).toContain("find-load-error");
  });
});
