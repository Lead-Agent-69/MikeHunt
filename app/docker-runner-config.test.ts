import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local Docker scraper runner config", () => {
  it("passes local app env into the scraper before scraper-specific overrides", () => {
    const compose = readFileSync("docker-compose.local.yml", "utf8");

    expect(compose).toContain("env_file:");
    expect(compose).toContain("path: .env.local");
    expect(compose).toContain("path: .env.local.scraper");
    expect(compose.indexOf("path: .env.local")).toBeLessThan(
      compose.indexOf("path: .env.local.scraper"),
    );
    expect(compose).toContain("STATUS_PORT: 8787");
    expect(compose).toContain("127.0.0.1:8787:8787");
    expect(compose).toContain(
      'SCRAPER_EXECUTION_MODE: "${SCRAPER_EXECUTION_MODE:-queue}"',
    );
    expect(compose).toContain('CACHE_ONLY_MODE: "${CACHE_ONLY_MODE:-false}"');
  });
});
