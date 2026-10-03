import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("status source-health summary", () => {
  it("uses normalized source-health summary for buyer-facing proof totals", () => {
    const page = readFileSync("app/(dashboard)/status/page.tsx", "utf8");

    expect(page).toContain("const healthSummary = sourceHealth?.summary || {}");
    expect(page).toContain("healthSummary.ready ?? healthSummary.healthy");
    expect(page).toContain("healthSummary.activeRows ?? publicRows");
    expect(page).toContain("healthSummary.rowsWithPhotos ?? photoRows");
    expect(page).toContain("healthSummary.averageQuality ?? 0");
    expect(page).toContain("proofRows.toLocaleString()");
    expect(page).toContain("proofPhotoRows.toLocaleString()");
  });
});
