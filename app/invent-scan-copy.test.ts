import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("invent-scan copy honesty", () => {
  it("Flash empty does not invent a live scan or instant fill", () => {
    const page = read("app/(dashboard)/flash-deals/page.tsx");
    expect(page).not.toContain("Live feed active");
    expect(page).not.toMatch(/constantly scanning/i);
    expect(page).not.toMatch(/show up here instantly/i);
    expect(page).toContain(
      "No high-urgency deals in saved inventory right now.",
    );
  });

  it("Arbitrage load says loading saved listings, not scanning the market", () => {
    const page = read("app/(dashboard)/arbitrage/page.tsx");
    expect(page).not.toContain("Scanning the market");
    expect(page).toContain("Loading saved listings…");
  });

  it("Scan primary CTA and empty state talk about saved inventory only", () => {
    const page = read("app/(dashboard)/scan/page.tsx");
    expect(page).toContain("Search saved inventory");
    expect(page).toContain("Updating saved inventory…");
    expect(page).toContain("No matching saved vehicles for this scope yet.");
    expect(page).not.toContain("Scan Market");
    expect(page).not.toMatch(/animation:\s*"pulse-ring/);
    expect(page).toContain("Last loaded:");
  });
});
