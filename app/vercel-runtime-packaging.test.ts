import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Vercel server runtime packaging", () => {
  it("ships the Node websocket runtime required by Supabase", () => {
    const config = readFileSync("next.config.js", "utf8");
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));

    expect(pkg.dependencies.ws).toBeTruthy();
    expect(config).toMatch(/["']ws["']/);
    expect(config).toMatch(/outputFileTracingIncludes\s*:/);
    expect(config).toContain("./node_modules/ws/**/*");
  });

  it("keeps browser scraper implementations out of the serverless queue route", () => {
    const route = readFileSync("app/api/scrape/run/route.ts", "utf8");
    expect(route).not.toMatch(/from\s+["']@\/lib\/scrapers\/runner["']/);
    expect(route).toContain('await import("@/lib/scrapers/runner")');
    expect(route.indexOf("isRemoteScrapeQueueEnabled")).toBeLessThan(
      route.indexOf('await import("@/lib/scrapers/runner")'),
    );
  });

  it("keeps Playwright out of the serverless source-health startup path", () => {
    const route = readFileSync("app/api/scrape/health/route.ts", "utf8");
    expect(route).not.toMatch(/from\s+["']@\/lib\/scrapers\/runner["']/);
    expect(route).toContain("runtimeSourceMetadata");
    expect(route).toContain('import("@/lib/scrapers/sources/govdeals")');
  });
});
