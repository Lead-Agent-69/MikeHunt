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
  it("shows nothing for ok or a missing block", () => {
    const ok = build(
      [...rows(40, "TX", "craigslist"), ...rows(20, "TX", "cargurus")],
      ["TX"],
    );
    expect(ok.status).toBe("ok");
    expect(coverageNotice(ok)).toBeNull();
    expect(coverageNotice(undefined)).toBeNull();
  });

  it("unavailable remains unknown even when location warming is active", () => {
    const notice = coverageNotice(unavailableCoverage("private diagnostic"), {
      scanning: true,
    });
    expect(notice?.tone).toBe("unavailable");
    expect(notice?.detail).toContain("does not mean there are no cars");
    expect(notice?.detail).not.toContain("private diagnostic");
  });

  it("none: no recent inventory is not no cars for sale", () => {
    const none = build([], ["TX", "OK"]);
    const notice = coverageNotice(none);
    expect(notice).toEqual(
      expect.objectContaining({
        tone: "none",
        headline: "No recent listings for TX, OK yet.",
      }),
    );
    expect(notice?.detail).toContain("isn't a complete view");
    expect(notice?.detail).toContain("updates aren't instant");
    expect(notice?.detail).not.toMatch(/minute|hour|ETA|%/i);
  });

  it("thin: uses the API's own counts per state and source", () => {
    const thin = build(
      [...rows(9, "TX", "craigslist"), ...rows(3, "OK", "craigslist")],
      ["TX", "OK"],
    );
    expect(thin.status).toBe("thin");
    expect(coverageNotice(thin)?.headline).toBe("Limited results for TX, OK.");
    expect(coverageNotice(thin)?.detail).toContain(
      "12 recent listings seen in the last 7 days (TX 9, OK 3), from 1 source.",
    );
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
    expect(coverageNotice(capped)?.detail).toContain(
      "at least 10 recent listings",
    );
  });

  it("recent location save never claims a collection job is running", () => {
    const none = build([], ["IA"]);
    const notice = coverageNotice(none, { scanning: true, states: ["IA"] });
    expect(notice).toEqual(
      expect.objectContaining({
        tone: "scanning",
        headline: "Search area updated: IA.",
      }),
    );
    expect(notice?.detail).toContain(
      "doesn't guarantee an immediate source refresh",
    );
    expect(notice?.headline).not.toMatch(/checking|scanning|collecting/i);
    expect(notice?.detail).not.toMatch(/hour|ETA|%/i);
  });

  it("Discover renders the notice from data.coverage with next steps", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    expect(page).toContain("coverage={data?.coverage}");
    expect(page).toContain("isRefreshing={isValidating}");
    expect(page).toContain("mutate().catch(() => undefined)");
    const comp = readFileSync(
      "components/discovery/CoverageNotice.tsx",
      "utf8",
    );
    expect(comp).toContain('href="/settings"');
    expect(comp).toContain('href="/searches"');
    expect(comp).toContain("location-demand-warming");
    expect(comp).toContain("data-tone");
  });

  it("uses customer language in every available state", () => {
    const cases = [
      coverageNotice(build([], [])),
      coverageNotice(build(rows(2, "MO", "craigslist"), ["MO"])),
      coverageNotice(build([], ["MO"]), { scanning: true, states: ["MO"] }),
      coverageNotice(unavailableCoverage("runner SQL timeout")),
    ];
    for (const notice of cases) {
      expect(JSON.stringify(notice)).not.toMatch(/Zeus|SQL|RPC|runner|scrap/i);
    }
    expect(cases[0]?.headline).toContain("nationwide");
  });

  it("never acknowledges an old preference location as the current search area", () => {
    const warming = { scanning: true, states: ["MO"] };
    expect(coverageNotice(build([], ["TX"]), warming)?.headline).toBe(
      "No recent listings for TX yet.",
    );
    expect(coverageNotice(build([], []), warming)?.headline).toBe(
      "No recent listings for nationwide yet.",
    );
  });
});
