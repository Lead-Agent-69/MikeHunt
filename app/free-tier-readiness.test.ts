import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assessUsage, resources } from "../scripts/free-tier-readiness.mjs";

const now = Date.parse("2026-10-11T22:00:00Z");
const snapshot = () => ({
  measuredAt: new Date(now).toISOString(),
  vercelHobbyEligible: true,
  periodElapsed: { vercel: 0.5, supabase: 0.5 },
  usage: Object.fromEntries(resources.map(({ id }) => [id, 0])),
});

describe("free-tier readiness", () => {
  it("never treats missing usage as zero or a green release", () => {
    expect(assessUsage({}, now).status).toBe("unverified");
    expect(assessUsage({}, now).rows.every((r) => r.status === "unknown")).toBe(
      true,
    );
  });
  it("accepts explicitly measured zero, but requires eligibility", () => {
    expect(assessUsage(snapshot(), now).status).toBe("ok");
    expect(
      assessUsage({ ...snapshot(), vercelHobbyEligible: undefined }, now)
        .status,
    ).toBe("unverified");
    expect(
      assessUsage({ ...snapshot(), vercelHobbyEligible: false }, now).status,
    ).toBe("hold");
  });
  it("reserves database headroom without applying monthly projections to storage", () => {
    const data = snapshot();
    data.usage.databaseBytes = 350_000_000;
    expect(assessUsage(data, now).status).toBe("warn");
    data.usage.databaseBytes = 450_000_000;
    expect(assessUsage(data, now).status).toBe("hold");
  });
  it("flags projected monthly exhaustion and keeps cached egress separate", () => {
    const data = snapshot();
    data.usage.uncachedEgressBytes = 2_300_000_000;
    const report = assessUsage(data, now);
    expect(report.status).toBe("hold");
    expect(report.rows.find((r) => r.id === "cachedEgressBytes")?.status).toBe(
      "ok",
    );
  });
  it("rejects old, future, invalid or incomplete observations", () => {
    for (const measuredAt of [
      "bad",
      new Date(now + 1).toISOString(),
      new Date(now - 86_400_001).toISOString(),
    ]) {
      expect(assessUsage({ ...snapshot(), measuredAt }, now).status).toBe(
        "unverified",
      );
    }
    for (const value of [null, "0", -1, NaN, Infinity]) {
      const data = snapshot();
      Object.assign(data.usage, { databaseBytes: value });
      expect(assessUsage(data, now).status).toBe("unverified");
    }
    expect(
      assessUsage(
        { ...snapshot(), periodElapsed: { vercel: 0, supabase: 0.5 } },
        now,
      ).status,
    ).toBe("unverified");
  });
  it("retains main-only builds and conservative daily authenticated crons", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    expect(config.git.deploymentEnabled).toEqual({ main: true, "**": false });
    expect(config.crons.length).toBeLessThanOrEqual(3);
    for (const cron of config.crons) {
      expect(cron.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
      const route = readFileSync(`app${cron.path}/route.ts`, "utf8");
      expect(route).toContain("isAuthorizedCron(");
      expect(route).toContain("export const maxDuration = 60");
    }
  });
});
