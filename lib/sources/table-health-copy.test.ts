import { describe, expect, it } from "vitest";
import { tableHealthCopy } from "./table-health-copy";

describe("customer source evidence copy", () => {
  it.each([
    ["ready", "Listings available"],
    ["needs_run", "Needs refresh"],
    ["needs_login", "Sign-in required"],
    ["blocked", "Unavailable"],
    ["disabled", "Not connected"],
    ["no_rows", "No saved matches"],
    ["unknown", "Not verified"],
    ["future_internal_status", "Not verified"],
    ["constructor", "Not verified"],
    ["toString", "Not verified"],
  ])("translates %s without exposing an internal enum", (readiness, label) => {
    expect(tableHealthCopy({ readiness }).label).toBe(label);
  });

  it("does not fabricate zero inventory, photo coverage or freshness", () => {
    const result = tableHealthCopy();
    expect(result).toEqual({
      label: "Not verified",
      description: "Not verified · Listing freshness not verified",
    });
    expect(result.description).not.toMatch(/0|rows|pending|unknown/);
  });

  it("reports saved evidence without claiming a successful scrape or total inventory", () => {
    expect(
      tableHealthCopy({
        readiness: "ready",
        activeRows: 1,
        photoCoveragePct: 100,
        freshnessHours: 2,
      }).description,
    ).toBe(
      "Listings available · 1 saved listing · 100% with photos · Latest listing seen 2h ago",
    );
    expect(
      tableHealthCopy({ activeRows: 0, photoCoveragePct: 0, freshnessHours: 0 })
        .description,
    ).toBe(
      "Not verified · 0 saved listings · 0% with photos · Latest listing seen within the past hour",
    );
  });

  it.each([NaN, Infinity, -1])(
    "does not display invalid evidence (%s)",
    (value) => {
      expect(
        tableHealthCopy({
          activeRows: value,
          photoCoveragePct: value,
          freshnessHours: value,
        }).description,
      ).toBe("Not verified · Listing freshness not verified");
    },
  );

  it.each(["Needs database", "Off for site terms"])(
    "does not invite a refresh when source is %s",
    (userStatus) => {
      expect(
        tableHealthCopy({ readiness: "needs_run", userStatus }).label,
      ).toBe("Unavailable");
    },
  );

  it("does not display arbitrary server messages as customer copy", () => {
    expect(
      tableHealthCopy({ userStatus: "runner_failed: postgres offline" }).label,
    ).toBe("Not verified");
  });
});
