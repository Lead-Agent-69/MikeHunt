import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanPageHrefFromApiKey } from "@/lib/search/scan-page-href";

describe("scanPageHrefFromApiKey", () => {
  it("maps the API key to the /scan page with the same filters", () => {
    expect(
      scanPageHrefFromApiKey("/api/scan?sort=score&state=TX&q=civic"),
    ).toBe("/scan?sort=score&state=TX&q=civic");
  });

  it("drops pagination and falls back when there is no key", () => {
    expect(scanPageHrefFromApiKey("/api/scan?sort=price&page=3")).toBe(
      "/scan?sort=price",
    );
    expect(scanPageHrefFromApiKey("/api/scan")).toBe("/scan");
    expect(scanPageHrefFromApiKey(null, "/scan?sort=score")).toBe(
      "/scan?sort=score",
    );
  });

  it("Scan never hands the raw API key to a link", () => {
    const source = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    expect(source).not.toMatch(/href=\{swrKey/);
    expect(source).toContain("href={scanPageHrefFromApiKey(swrKey");
  });
});
