import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CI_CANDIDATE_SOURCES,
  CI_DEFAULT_SOURCES,
  resolveCiSources,
} from "./ci-sources";
import {
  TOS_RESTRICTED_SOURCES,
  isAutomationAllowedSource,
} from "./sweep-schedule";

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

describe("scrape-ci DEFAULT_SOURCES", () => {
  it("candidates are runner-enabled; dead ids and headed-only truecar stay out", () => {
    const candidates: string[] = [...CI_CANDIDATE_SOURCES];
    const enabled = runnerEnabled();
    for (const id of candidates) expect(enabled.get(id)).toBe(true);
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
      expect(candidates).not.toContain(id);
    }
    expect(enabled.get("truecar")).toBe(true);
    // Image/fleet configs must not bake SCRAPE_SOURCES — terms-safe defaults are code-side;
    // operators opt in at runtime only (see docs/SCRAPER-FLEET.md / #85).
    for (const file of ["fly.toml", "Dockerfile.scraper"]) {
      const src = readFileSync(file, "utf8");
      expect(src).not.toMatch(/^\s*ENV\s+SCRAPE_SOURCES\s*=/m);
      expect(src).not.toMatch(/^\s*SCRAPE_SOURCES\s*=/m);
    }
  });

  it("default run drops every terms-restricted source (same rule as sweep + preview)", () => {
    for (const id of CI_DEFAULT_SOURCES) {
      expect(TOS_RESTRICTED_SOURCES[id]).toBeUndefined();
      expect(isAutomationAllowedSource(id, "")).toBe(true);
    }
    for (const id of [
      "craigslist",
      "offerup",
      "carvana",
      "autotempest",
      "ebay_sold",
      "ebay_motors",
      "cars_com",
      "autotrader",
      "publicsurplus",
      "municibid",
      "copart",
    ]) {
      expect(CI_DEFAULT_SOURCES).not.toContain(id);
    }
    expect(CI_DEFAULT_SOURCES).toEqual([
      "carparts_com",
      "govdeals",
      "allsurplus",
      "gsa_auctions",
      "curated_dealers",
    ]);
    const selection = resolveCiSources([], "");
    expect(selection).toEqual({
      sources: CI_DEFAULT_SOURCES,
      origin: "default",
      optedInRestricted: [],
    });
  });

  it("explicit args or SCRAPE_SOURCES are an operator opt-in and report restricted ids", () => {
    expect(resolveCiSources(["craigslist", "govdeals"], "copart")).toEqual({
      sources: ["craigslist", "govdeals"],
      origin: "args",
      optedInRestricted: ["craigslist"],
    });
    expect(resolveCiSources([], " municibid, govdeals ,municibid")).toEqual({
      sources: ["municibid", "govdeals"],
      origin: "env",
      optedInRestricted: ["municibid"],
    });
    expect(resolveCiSources([], "govdeals").optedInRestricted).toEqual([]);
  });

  it("scrape-ci and the worker resolve sources through ci-sources, not a raw list", () => {
    const ci = readFileSync("scripts/scrape-ci.ts", "utf8");
    expect(ci).toContain("resolveCiSources(");
    expect(ci).not.toMatch(/const DEFAULT_SOURCES = \[/);
    const worker = readFileSync("workers/scrape-worker.ts", "utf8");
    expect(worker).toContain("scripts/scrape-ci.ts");
    expect(readFileSync("scripts/scrape-local.sh", "utf8")).not.toMatch(
      /^\s*SCRAPE_SOURCES=/m,
    );
  });

  it("does not upload listing photos into vehicle-photos by default", () => {
    const src = readFileSync("scripts/scrape-ci.ts", "utf8");
    expect(src).toContain('process.env.CACHE_PHOTOS_MAX || "0"');
    expect(src).toContain("if (photoCacheMax > 0)");
    expect(src).not.toContain('CACHE_PHOTOS_MAX || "12"');
    for (const file of ["fly.toml", "Dockerfile.scraper"]) {
      expect(readFileSync(file, "utf8")).toMatch(
        /CACHE_PHOTOS_MAX\s*=\s*"?0"?/,
      );
    }
    const fly = readFileSync("fly.toml", "utf8");
    const image = readFileSync("Dockerfile.scraper", "utf8");
    expect(fly).toContain('dockerfile = "Dockerfile.scraper"');
    expect(image).toContain("workers/scrape-worker.ts");
    expect(image).not.toContain("workers/index.ts");
    expect(fly).not.toContain("npm run worker");
  });
});
