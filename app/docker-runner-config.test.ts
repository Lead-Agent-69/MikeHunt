import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local Docker scraper runner config", () => {
  it("retains optional native runtime entries for clean Linux installs", () => {
    const lock = JSON.parse(readFileSync("package-lock.json", "utf8"));
    for (const name of ["@emnapi/core", "@emnapi/runtime"]) {
      expect(lock.packages[`node_modules/${name}`]?.version).toBeTruthy();
      expect(lock.packages[`node_modules/${name}`]?.integrity).toMatch(
        /^sha512-/,
      );
    }
  });
  it("keeps production infrastructure private and waits for readiness", () => {
    const compose = readFileSync("docker-compose.yml", "utf8");
    expect(compose).toContain('"127.0.0.1:6379:6379"');
    // FlareSolverr is retired (lib/scrapers/retired.ts): no challenge-solver service ships with Zeus.
    expect(compose).not.toContain("flaresolverr");
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain("init: true");
    expect(compose).toContain(
      "NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}",
    );
    const dockerfile = readFileSync("Dockerfile", "utf8");
    expect(dockerfile).toContain("FROM node:24-alpine AS base");
    expect(dockerfile).toContain("HUSKY=0 npm ci");
    expect(dockerfile).toContain("ARG NEXT_PUBLIC_SUPABASE_URL");
    expect(dockerfile).not.toContain("ARG SUPABASE_SERVICE_ROLE_KEY");
  });
  it("builds browser workers on a supported runtime with locked dependencies", () => {
    const dockerfile = readFileSync("Dockerfile.scraper", "utf8");
    expect(dockerfile).toContain("FROM node:24-bookworm-slim");
    expect(dockerfile).toContain("HUSKY=0 npm ci --include=dev");
    expect(dockerfile).toContain(
      "playwright install --with-deps chromium chrome",
    );
    expect(dockerfile).toContain("patchright install chromium");
    expect(dockerfile).not.toContain("npm install --include=dev");
    const ignored = readFileSync(".dockerignore", "utf8");
    expect(ignored.split(/\r?\n/)).toContain("artifacts");
  });
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
      'SCRAPER_EXECUTION_MODE: "${SCRAPER_EXECUTION_MODE:-hybrid}"',
    );
    expect(compose).toContain('CACHE_ONLY_MODE: "${CACHE_ONLY_MODE:-false}"');
  });
});
