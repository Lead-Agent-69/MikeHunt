import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function defaultSources(): string[] {
  const src = readFileSync("scripts/scrape-ci.ts", "utf8");
  const block = src.match(/const DEFAULT_SOURCES = \[([\s\S]*?)\];/);
  if (!block) throw new Error("DEFAULT_SOURCES missing");
  return [...block[1].matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
}

function runnerEnabled(): Map<string, boolean> {
  const src = readFileSync("lib/scrapers/runner.ts", "utf8");
  const parts = src.split(/\n\s*id:\s*"/).slice(1);
  const out = new Map<string, boolean>();
  for (const part of parts) {
    const id = part.slice(0, part.indexOf('"'));
    const flag = part.slice(0, 4000).match(/enabled:\s*(true|false)/);
    if (!flag) throw new Error(`no enabled flag for ${id}`);
    out.set(id, flag[1] === "true");
  }
  return out;
}

function scrapeSourcesEnv(file: string): string[] {
  const src = readFileSync(file, "utf8");
  const m = src.match(/SCRAPE_SOURCES\s*=\s*"?([a-z0-9_,]+)"?/);
  if (!m) throw new Error(`SCRAPE_SOURCES missing in ${file}`);
  return m[1].split(",").filter(Boolean);
}

describe("scrape-ci DEFAULT_SOURCES", () => {
  it("runs open enabled feeds, drops dead ids, and keeps truecar headed-only", () => {
    const defaults = defaultSources();
    const enabled = runnerEnabled();
    for (const id of defaults) expect(enabled.get(id)).toBe(true);
    for (const id of [
      "cargurus",
      "independent_dealer",
      "iaa",
      "manheim",
      "acv",
      "adesa",
      "facebook_marketplace",
      "vroom",
      "auto_discover",
      "truecar",
    ]) {
      expect(defaults).not.toContain(id);
    }
    for (const id of [
      "govdeals",
      "allsurplus",
      "municibid",
      "gsa_auctions",
      "offerup",
      "publicsurplus",
    ]) {
      expect(defaults).toContain(id);
      expect(enabled.get(id)).toBe(true);
    }
    expect(enabled.get("truecar")).toBe(true);
    for (const file of ["fly.toml", "Dockerfile.scraper"]) {
      const headed = scrapeSourcesEnv(file);
      expect(headed).toContain("truecar");
      for (const id of defaults) expect(headed).toContain(id);
      expect(headed.filter((id) => !defaults.includes(id) && id !== "truecar")).toEqual(
        [],
      );
    }
  });

  it("does not upload listing photos into vehicle-photos by default", () => {
    const src = readFileSync("scripts/scrape-ci.ts", "utf8");
    expect(src).toContain('process.env.CACHE_PHOTOS_MAX || "0"');
    expect(src).toContain("if (photoCacheMax > 0)");
    expect(src).not.toContain('CACHE_PHOTOS_MAX || "12"');
    for (const file of ["fly.toml", "Dockerfile.scraper"]) {
      expect(readFileSync(file, "utf8")).toMatch(/CACHE_PHOTOS_MAX\s*=\s*"?0"?/);
    }
    const fly = readFileSync("fly.toml", "utf8");
    const image = readFileSync("Dockerfile.scraper", "utf8");
    expect(fly).toContain('dockerfile = "Dockerfile.scraper"');
    expect(image).toContain("workers/scrape-worker.ts");
    expect(image).not.toContain("workers/index.ts");
    expect(fly).not.toContain("npm run worker");
  });
});
