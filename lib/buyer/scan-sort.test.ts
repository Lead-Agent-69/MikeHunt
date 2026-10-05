import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultScanSort } from "@/lib/buyer/scan-sort";

describe("defaultScanSort", () => {
  it("sorts by trust score for personal, diy, and parts buyers", () => {
    for (const mode of ["personal", "diy", "parts", "enthusiast", "teardown"]) {
      expect(defaultScanSort(mode)).toBe("score");
    }
  });

  it("keeps profit for flip desks and unknown modes", () => {
    for (const mode of ["reseller", "dealer", undefined, "", "unknown"]) {
      expect(defaultScanSort(mode)).toBe("profit");
    }
  });

  it("Scan applies the mode default only when the URL has no sort", () => {
    const source = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    expect(source).toContain("if (sortParam) setSort(sortParam);");
    expect(source).toMatch(/else\s+setSort\(\s*defaultScanSort\(/);
  });
});
