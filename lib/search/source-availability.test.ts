import { describe, expect, it } from "vitest";
import { sourceAvailabilityNotice as notice } from "./source-availability";

describe("source coverage is not search-result proof", () => {
  it("keeps healthy availability quiet without asserting a complete market", () => {
    expect(notice({ sources: [{ id: "one", readiness: "ready" }] })).toBeNull();
  });
  it("keeps a failed refresh unknown even with older ready data", () => {
    expect(
      notice({ error: true, sources: [{ id: "one", readiness: "ready" }] })
        ?.title,
    ).toBe("Source coverage unavailable");
    expect(notice({ configured: false })?.title).toBe(
      "Source coverage unavailable",
    );
  });
  it("distinguishes checking from absent evidence", () => {
    expect(notice({ loading: true })?.retry).toBe(false);
    expect(notice({ sources: [] })?.title).toBe("Source coverage unknown");
  });
  it("does not count empty or pending sources as successful searches", () => {
    const result = notice({
      sources: [
        { id: "one", readiness: "no_rows" },
        { id: "two", readiness: "needs_run" },
        { id: "three", readiness: "blocked" },
        { id: "four", readiness: "future_status" },
      ],
    });
    expect(result?.title).toBe("Partial source coverage");
    expect(result?.detail).toContain(
      "2 sources unavailable, 1 awaiting refresh, 1 without indexed rows",
    );
    expect(result?.detail).not.toContain("matching vehicles");
  });
  it("deduplicates repeated source identities", () => {
    expect(
      notice({
        sources: [
          { id: "one", readiness: "blocked" },
          { id: "one", readiness: "blocked" },
        ],
      })?.detail,
    ).toContain("1 sources unavailable");
  });
});
