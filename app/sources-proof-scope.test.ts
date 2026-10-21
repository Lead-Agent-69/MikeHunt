import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sources proof scope", () => {
  it("keeps the tall search header in document flow rather than covering source controls", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");
    expect(page).not.toContain("md:sticky md:top-0");
    expect(page).toContain(
      "grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3 xl:grid-cols-5",
    );
  });
  it("connects refresh to the current scope and rechecks coverage without an admin runner", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");
    expect(page).toContain("<SourceRefreshAction");
    expect(page).toContain("scope={healthScope}");
    expect(page).toContain("void refreshHealth()");
    expect(page).toContain("Retry coverage check");
    expect(page).toContain("<details");
    expect(page).toContain("<summary");
    expect(page).toContain('sourceId !== "curated_dealers"');
    expect(page).toContain("href={scopedScanHrefForSource(source)}");
    expect(page).not.toContain("href={scanHrefForSource(source)}");
  });
  it("does not offer an unbounded dealer shortcut that the API would truncate", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");
    expect(page).not.toContain("All featured dealers");
    expect(page).toContain("No specific dealer");
    expect(page).toContain("<option key={dealer.id} value={dealer.id}>");
  });
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
    expect(page).toContain("From $5k");
    expect(page).toContain("${healthScope.titleType} title");
    expect(page).toContain("from $${healthScope.minPrice.toLocaleString()}");
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
