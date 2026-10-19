import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("status source-health summary", () => {
  it("uses normalized source-health summary for buyer-facing proof totals", () => {
    const page = readFileSync("app/(dashboard)/status/page.tsx", "utf8");

    expect(page).toContain(
      "const healthSummary = sourceHealth?.summary || data?.sourceHealth || {}",
    );
    expect(page).toContain("healthSummary.ready ??");
    expect(page).toContain("healthSummary.healthy ??");
    expect(page).toContain("healthSummary.readySources");
    expect(page).toContain(
      "healthSummary.activeRows ?? healthSummary.activeDeals ?? publicRows",
    );
    expect(page).toContain("healthSummary.rowsWithPhotos ?? photoRows");
    expect(page).toContain("healthSummary.averageQuality ?? 0");
    expect(page).toContain("proofRows.toLocaleString()");
    expect(page).toContain("proofPhotoRows.toLocaleString()");
    expect(page).toContain('label="Rows in source proof"');
    expect(page).toContain("Inventory quality sample");
    expect(page).toContain("q?.detailCoverage?.total");
  });

  it("keeps partial failures actionable instead of rendering false zeroes", () => {
    const page = readFileSync("app/(dashboard)/status/page.tsx", "utf8");

    expect(page).toContain("if (!response.ok)");
    expect(page).toContain("shouldRetryOnError: false");
    expect(page).toContain("<LoadingState");
    expect(page).toContain("<ErrorState");
    expect(page).toContain("<InlineError");
    expect(page).toContain("onRetry={() => mutate()}");
    expect(page).toContain("onRetry={() => mutateSourceHealth()}");
    expect(page).toContain("sourceHealth?.sources ?? data?.sources ?? []");
  });
});
