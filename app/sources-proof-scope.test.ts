import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sources proof scope", () => {
  it("explains reported details without presenting a quality score as verification", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");
    expect(page).toContain("COMPLETENESS_EXPLANATION");
    expect(page).toContain("detailCompletenessCopy(proofQuality)");
    expect(page).not.toContain("average detail quality");
    expect(page).not.toContain("source.qualityLabel ||");
    expect(page).toContain("Still needs checking");
  });
  it("constrains filter fields to the mobile grid and labels dropdowns", () => {
    const page = readFileSync("app/(dashboard)/sources/page.tsx", "utf8");
    expect(page).toContain(
      "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3",
    );
    for (const label of [
      "Vehicle market",
      "Seller type",
      "Title status",
      "Dealer",
      "State",
    ]) {
      expect(page).toContain(`aria-label="${label}"`);
    }
    expect(page).toContain("aria-pressed={selectedCategory === cat.id}");
    expect(page).toContain("<span>Vehicle search</span>");
    expect(page).toContain("<span>Makes</span>");
    expect(page).not.toContain("bg-[var(--grad-amber)] text-[#0A0A0F]");
    expect(page).toContain("btn btn-primary inline-flex min-h-11 shrink-0");
  });
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
    expect(page).toContain('weightedCompleteness(allReadySources, "vinPct")');
    expect(page).toContain("weightedCompleteness(allReadySources");
    expect(page).toContain('"sellerContactPct"');
    expect(page).toContain("auctionDateApplies");
    expect(page).toContain("source.completeness?.applicableRows?.auctionDate");
    expect(page).toContain("if (!totalRows) return null");
    expect(page).toContain('item.value == null ? "N/A"');
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
