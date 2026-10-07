import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Flash Deals page honesty", () => {
  const page = readFileSync("app/(dashboard)/flash-deals/page.tsx", "utf8");

  it("client-fetches /api/flash-deals and uses DiscoveryCard (not DealCard RSC)", () => {
    expect(page).toContain('"use client"');
    expect(page).toContain("/api/flash-deals");
    expect(page).toContain("DiscoveryCard");
    expect(page).not.toContain('from "@/components/shared/DealCard"');
    expect(page).not.toContain("createServerComponentClient");
    expect(page).not.toContain("window.location");
  });

  it("uses honest copy without fake urgency or profit invent", () => {
    expect(page).toMatch(/Fresh-to-us listings from saved inventory/i);
    expect(page).not.toMatch(/Act fast before they sell/i);
    expect(page).not.toMatch(/highest-margin/i);
    expect(page).not.toMatch(/profit_score/i);
    expect(page).not.toMatch(/profitEstimate/i);
    expect(page).toContain('href: "/discover"');
    expect(page).not.toContain('href: "/find"');
  });
});
