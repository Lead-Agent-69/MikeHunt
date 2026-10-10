import { describe, expect, it } from "vitest";
import {
  FREE_TIER,
  PACING,
  dailyCapFromEnv,
  embeddingNeed,
  embeddingSourceHash,
  paceDelayMs,
  prioritizeCandidates,
  quotaKind,
  retryDelayMs,
  runBudget,
  startOfPacificDay,
} from "./embedding-freshness";

describe("embeddingSourceHash", () => {
  it("is stable for identical text and changes with any edit", () => {
    const a = embeddingSourceHash("2019 Ford Explorer XLT 52k miles");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(embeddingSourceHash("2019 Ford Explorer XLT 52k miles")).toBe(a);
    expect(embeddingSourceHash("2019 Ford Explorer XLT 53k miles")).not.toBe(a);
  });
});

describe("embeddingNeed", () => {
  const h = embeddingSourceHash("x");
  it("classifies missing, legacy, changed and current rows", () => {
    expect(embeddingNeed({}, false, h)).toBe("missing");
    expect(embeddingNeed({ embedding_source_hash: null }, true, h)).toBe(
      "legacy",
    );
    expect(embeddingNeed({ embedding_source_hash: "old" }, true, h)).toBe(
      "changed",
    );
    expect(embeddingNeed({ embedding_source_hash: h }, true, h)).toBeNull();
  });
});

describe("prioritizeCandidates", () => {
  it("orders missing > changed > legacy, newest first, and caps", () => {
    const rows = [
      { id: "L-new", tier: "legacy" as const, created_at: "2026-10-09" },
      { id: "M-old", tier: "missing" as const, created_at: "2026-10-01" },
      { id: "C", tier: "changed" as const, created_at: "2026-10-05" },
      { id: "M-new", tier: "missing" as const, created_at: "2026-10-08" },
    ];
    expect(prioritizeCandidates(rows, 3).map((r) => r.id)).toEqual([
      "M-new",
      "M-old",
      "C",
    ]);
    expect(prioritizeCandidates(rows, -1)).toEqual([]);
  });
});

describe("free-tier pacing", () => {
  it("keeps a minute of batches under the documented RPM and TPM", () => {
    const delay = paceDelayMs(PACING.batchSize, 2_000);
    const batchesPerMinute = 60_000 / delay;
    expect(batchesPerMinute * PACING.batchSize).toBeLessThanOrEqual(
      FREE_TIER.rpm,
    );
    expect(batchesPerMinute * 2_000).toBeLessThanOrEqual(FREE_TIER.tpm);
    // token-heavy batch is throttled by TPM instead
    expect(paceDelayMs(5, 24_000)).toBe(60_000);
  });

  it("default daily cap leaves headroom under the 1,000 RPD free tier", () => {
    expect(PACING.defaultDailyCap).toBeLessThan(FREE_TIER.rpd);
    expect(dailyCapFromEnv(undefined)).toBe(900);
    expect(dailyCapFromEnv("abc")).toBe(900);
    expect(dailyCapFromEnv("400")).toBe(400);
  });

  it("runBudget never exceeds the per-run or remaining daily allowance", () => {
    expect(runBudget(250, 900, 0)).toBe(250);
    expect(runBudget(250, 900, 800)).toBe(100);
    expect(runBudget(250, 900, 950)).toBe(0);
  });
});

describe("startOfPacificDay", () => {
  it("returns PT midnight during daylight time (UTC-7)", () => {
    expect(
      startOfPacificDay(new Date("2026-10-09T23:30:00Z")).toISOString(),
    ).toBe("2026-10-09T07:00:00.000Z");
    // 02:00 UTC on the 10th is still the 9th in PT
    expect(
      startOfPacificDay(new Date("2026-10-10T02:00:00Z")).toISOString(),
    ).toBe("2026-10-09T07:00:00.000Z");
  });
  it("returns PT midnight during standard time (UTC-8)", () => {
    expect(
      startOfPacificDay(new Date("2026-12-15T12:00:00Z")).toISOString(),
    ).toBe("2026-12-15T08:00:00.000Z");
  });
});

describe("quota errors", () => {
  const rate = {
    statusCode: 429,
    responseBody:
      '{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"EmbedContentRequestsPerMinutePerUserPerProjectPerModel-FreeTier"},{"@type":"type.googleapis.com/google.rpc.RetryInfo","retryDelay": "37s"}]}}',
  };
  const daily = {
    lastError: {
      statusCode: 429,
      responseBody:
        '{"error":{"status":"RESOURCE_EXHAUSTED","details":[{"quotaId":"EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier"}]}}',
    },
  };
  it("distinguishes per-minute from per-day exhaustion", () => {
    expect(quotaKind(rate)).toBe("rate");
    expect(quotaKind(daily)).toBe("daily");
    expect(quotaKind(new Error("boom"))).toBeNull();
    expect(quotaKind({ statusCode: 500, responseBody: "x" })).toBeNull();
  });
  it("honours RetryInfo, then Retry-After, then exponential backoff", () => {
    expect(retryDelayMs(rate, 0)).toBe(38_000);
    expect(
      retryDelayMs(
        { statusCode: 429, responseHeaders: { "retry-after": "5" } },
        0,
      ),
    ).toBe(6_000);
    expect(retryDelayMs({ statusCode: 429 }, 0)).toBe(15_000);
    expect(retryDelayMs({ statusCode: 429 }, 1)).toBe(30_000);
    expect(retryDelayMs({ statusCode: 429 }, 9)).toBe(120_000);
  });
});
