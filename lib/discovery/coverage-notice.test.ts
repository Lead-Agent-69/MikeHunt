import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildDiscoverCoverage,
  unavailableCoverage,
} from "@/lib/discovery/coverage";
import { coverageNotice } from "@/lib/discovery/coverage-notice";

const now = new Date("2026-10-05T12:00:00Z");
const seen = "2026-10-04T12:00:00Z";
const rows = (n: number, state: string, source: string) =>
  Array.from({ length: n }, () => ({
    source,
    location_state: state,
    last_seen_at: seen,
  }));
const build = (marketRows: ReturnType<typeof rows>, states: string[]) =>
  buildDiscoverCoverage({
    marketRows,
    feedRows: marketRows,
    states,
    rowCap: 5000,
    now,
  });

describe("coverageNotice", () => {
  it("shows nothing for ok, unavailable or a missing block", () => {
    const ok = build(
      [...rows(40, "TX", "craigslist"), ...rows(20, "TX", "cargurus")],
      ["TX"],
    );
    expect(ok.status).toBe("ok");
    expect(coverageNotice(ok)).toBeNull();
    expect(coverageNotice(unavailableCoverage("no db"))).toBeNull();
    expect(coverageNotice(undefined)).toBeNull();
  });

  it("none: honest cold banner — Zeus not instant, no ETA", () => {
    const none = build([], ["TX", "OK"]);
    const notice = coverageNotice(none);
    expect(notice).toEqual(
      expect.objectContaining({
        tone: "none",
        headline: "No fresh saved listings for TX, OK yet.",
      }),
    );
    expect(notice?.detail).toMatch(/Zeus \(not instant\)/);
    expect(notice?.detail).not.toMatch(/minute|hour|ETA|%/i);
  });

  it("thin: uses the API's own counts per state and source", () => {
    const thin = build(
      [...rows(9, "TX", "craigslist"), ...rows(3, "OK", "craigslist")],
      ["TX", "OK"],
    );
    expect(thin.status).toBe("thin");
    expect(coverageNotice(thin)?.headline).toBe(
      "Coverage is thin in TX, OK: 12 fresh listings in the last 7 days (TX 9, OK 3), from 1 source.",
    );
    expect(coverageNotice(thin)?.detail).toMatch(/Zeus \(not instant\)/);
  });

  it("says 'at least' when the API counts were capped", () => {
    const capped = buildDiscoverCoverage({
      marketRows: rows(10, "TX", "craigslist"),
      feedRows: [],
      states: ["TX"],
      rowCap: 10,
      now,
    });
    expect(capped.capped).toBe(true);
    expect(coverageNotice(capped)?.headline).toContain(
      "at least 10 fresh listings",
    );
  });

  it("scanning: Checking saved listings — no ETA", () => {
    const none = build([], ["IA"]);
    const notice = coverageNotice(none, { scanning: true, states: ["IA"] });
    expect(notice).toEqual(
      expect.objectContaining({
        tone: "scanning",
        headline: "Checking saved listings for IA…",
      }),
    );
    expect(notice?.detail).toMatch(/Zeus \(not instant\)/);
    expect(notice?.detail).not.toMatch(/hour|ETA|%/i);
  });

  it("Discover renders the notice from data.coverage with next steps", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    expect(page).toContain("<CoverageNotice coverage={data?.coverage} />");
    const comp = readFileSync(
      "components/discovery/CoverageNotice.tsx",
      "utf8",
    );
    expect(comp).toContain('href="/settings"');
    expect(comp).toContain('href="/searches"');
    expect(comp).toContain("location-demand-warming");
    expect(comp).toContain("data-tone");
  });
});
