import { describe, it, expect } from "vitest";
import {
  ABANDONED_AFTER_MS,
  classifyRun,
  summarizeReliability,
} from "./reliability";

const now = Date.parse("2026-10-09T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("scraper reliability", () => {
  it("classifies runs honestly", () => {
    expect(
      classifyRun(
        { source: "a", status: "success", deals_found: 3, started_at: ago(1) },
        now,
      ),
    ).toBe("productive");
    expect(
      classifyRun(
        { source: "a", status: "success", deals_found: 0, started_at: ago(1) },
        now,
      ),
    ).toBe("empty");
    expect(
      classifyRun({ source: "a", status: "error", started_at: ago(1) }, now),
    ).toBe("failed");
    expect(
      classifyRun(
        { source: "a", status: "running", started_at: ago(60_000) },
        now,
      ),
    ).toBe("inFlight");
    expect(
      classifyRun(
        {
          source: "a",
          status: "running",
          started_at: ago(ABANDONED_AFTER_MS + 1),
        },
        now,
      ),
    ).toBe("abandoned");
  });

  it("success rate = productive / finished (in-flight excluded)", () => {
    const s = summarizeReliability(
      [
        {
          source: "gsa",
          status: "success",
          deals_found: 10,
          started_at: ago(1000),
        },
        {
          source: "gsa",
          status: "success",
          deals_found: 0,
          started_at: ago(2000),
        },
        { source: "gsa", status: "running", started_at: ago(10) },
        { source: "dealers", status: "error", started_at: ago(3000) },
      ],
      now,
    );
    expect(s.successRatePct).toBe(33.3);
    expect(s.finishedRuns).toBe(3);
    const gsa = s.sources.find((x) => x.source === "gsa")!;
    expect(gsa.successRatePct).toBe(50);
    expect(gsa.lastProductiveAt).toBe(ago(1000));
    expect(s.sources[0].source).toBe("dealers"); // worst first
  });
});
