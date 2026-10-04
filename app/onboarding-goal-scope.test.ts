import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("onboarding goal scope", () => {
  it("saves a mode-aware scoped search without triggering a source run", () => {
    const source = readFileSync("app/onboarding/page.tsx", "utf8");

    expect(source).toContain("buyerMode");
    expect(source).toContain("repairCapability");
    expect(source).toContain("buildBuyerIntentQuery(intent)");
    expect(source).toContain('fetch("/api/preferences"');
    expect(source).not.toContain('fetch("/api/scrape/run"');
    expect(source).toContain("onboarding-buyers.webp");
    expect(source).toContain("aria-pressed={buyerMode === mode}");
    expect(source).toContain('useState("All vehicle types")');
    expect(source).toContain('"Coupes"');
    expect(source).toContain('"Convertibles"');
    expect(source).toContain('get("edit") === "1"');
  });
});
