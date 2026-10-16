import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("onboarding goal scope", () => {
  it("saves a mode-aware scoped search without triggering a source run", () => {
    const source = readFileSync("app/onboarding/page.tsx", "utf8");

    expect(source).toContain("buyerMode");
    expect(source).toContain("repairCapability");
    expect(source).toContain('params.set("states", intent.state)');
    expect(source).toContain('params.set("priceMin", String(intent.minPrice))');
    expect(source).toContain('params.set("priceMax", String(intent.maxPrice))');
    expect(source).toContain(
      'return `/market${params.size ? `?${params.toString()}` : ""}`',
    );
    expect(source).toContain('fetch("/api/preferences"');
    expect(source).not.toContain('fetch("/api/scrape/run"');
    expect(source).toContain("BUYING_WORKSPACE_MODE");
    expect(source).not.toContain("aria-pressed={selectedMode === mode}");
    expect(source).toContain("useState<string[]>([])");
    expect(source).toContain("vehicles.includes(item)");
    expect(source.indexOf("if (!profileResult.ok")).toBeLessThan(
      source.indexOf("writeLocalBuyerIntent(intent)"),
    );
    expect(source).toContain('"Coupes"');
    expect(source).toContain('"Convertibles"');
    expect(source).toContain('get("edit") === "1"');
  });
});
