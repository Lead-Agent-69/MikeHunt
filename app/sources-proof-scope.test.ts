import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sources proof scope", () => {
  it("preserves min price through source health and scan links", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");

    expect(page).toContain("minPrice?: number");
    expect(page).toContain("titleType?: string");
    expect(page).toContain('params.set("titleType", healthScope.titleType)');
    expect(page).toContain('params.set("titleType", health.scope.titleType)');
    expect(page).toContain(
      'params.set("minPrice", String(healthScope.minPrice))',
    );
    expect(page).toContain(
      'params.set("minPrice", String(health.scope.minPrice))',
    );
    expect(page).toContain('const scopeTitleType = params.get("titleType")');
    expect(page).toContain('const scopeMinPrice = params.get("minPrice")');
    expect(page).toContain("Salvage / repairable");
    expect(page).toContain("Over $5k");
    expect(page).toContain("${healthScope.titleType} title");
    expect(page).toContain("over $${healthScope.minPrice.toLocaleString()}");
  });

  it("refreshes and shows buyer-friendly availability after a scoped smart import", () => {
    const builder = readFileSync(
      "components/discovery/BuyerScopeBuilder.tsx",
      "utf8",
    );

    expect(builder).toContain("const loadSourceHealth = useCallback");
    expect(builder).toContain("await loadSourceHealth({ silent: true })");
    expect(builder).toContain("Listing availability");
    expect(builder).toContain("rowsWithPhotos");
    expect(builder).toContain("photoCoveragePct");
  });

  it("weights aggregate source proof by row volume", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");

    expect(page).toContain("function weightedCompleteness");
    expect(page).toContain("Number(source.activeRows) || 0");
    expect(page).toContain('weightedCompleteness(readySources, "vinPct")');
    expect(page).toContain(
      'weightedCompleteness(readySources, "sellerContactPct")',
    );
  });

  it("uses the API health summary as the authoritative source-proof contract", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");

    expect(page).toContain("const apiSummary = health?.summary || {}");
    expect(page).toContain("apiSummary.activeRows");
    expect(page).toContain("apiSummary.rowsWithPhotos");
    expect(page).toContain("apiSummary.photoCoveragePct");
    expect(page).toContain("apiSummary.averageQuality");
    expect(page).toContain("summary.ready");
    expect(page).toContain("proofRows.toLocaleString()");
  });

  it("resolves source deep links by catalog id and domain", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");

    expect(page).toContain("source.id.toLowerCase().includes(normalizedQuery)");
    expect(page).toContain(
      "source.url.toLowerCase().includes(normalizedQuery)",
    );
  });
});
