import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
vi.mock("./embeddings", () => ({ generateEmbeddings: generate }));
import { backfillEmbeddings, dealEmbeddingText } from "./deal-embeddings";
import { embeddingSourceHash } from "./embedding-freshness";

type Op = [string, ...any[]];
interface Fixture {
  missing?: any[];
  embedded?: any[];
  usedToday?: number;
  counts?: { active: number; embedded: number; missing: number; fresh: number };
  readError?: { message: string } | null;
  budgetError?: { message: string; code?: string } | null;
  writeError?: { message: string } | null;
}

/** Minimal PostgREST-builder fake: records each chain and answers by its filters. */
function database(f: Fixture = {}) {
  const writes: { id: string; patch: any }[] = [];
  const reads: Op[][] = [];
  const has = (ops: Op[], ...m: any[]) =>
    ops.some((o) => m.every((v, i) => o[i] === v));
  function resolve(ops: Op[]) {
    const upd = ops.find((o) => o[0] === "update");
    if (upd) {
      const id = ops.find((o) => o[0] === "eq")?.[2];
      if (!f.writeError) writes.push({ id, patch: upd[1] });
      return { error: f.writeError ?? null };
    }
    reads.push(ops);
    const sel = ops.find((o) => o[0] === "select")!;
    const c = f.counts ?? { active: 10, embedded: 4, missing: 6, fresh: 2 };
    if (sel[2]?.head) {
      if (has(ops, "gte", "embedded_at"))
        return f.budgetError
          ? { count: null, error: f.budgetError }
          : { count: f.usedToday ?? 0, error: null };
      if (has(ops, "not", "embedding_source_hash"))
        return { count: c.fresh, error: null };
      if (has(ops, "is", "embedding")) return { count: c.missing, error: null };
      if (has(ops, "not", "embedding"))
        return { count: c.embedded, error: null };
      return { count: c.active, error: null };
    }
    if (has(ops, "is", "embedding"))
      return {
        data: f.readError ? null : (f.missing ?? []),
        error: f.readError ?? null,
      };
    const range = ops.find((o) => o[0] === "range");
    const rows = f.embedded ?? [];
    return {
      data: rows.slice(range?.[1] ?? 0, (range?.[2] ?? 999) + 1),
      error: null,
    };
  }
  function builder(ops: Op[]): any {
    const b: any = {};
    for (const m of [
      "select",
      "is",
      "eq",
      "not",
      "gte",
      "order",
      "limit",
      "range",
      "update",
    ])
      b[m] = (...args: any[]) => builder([...ops, [m, ...args]]);
    b.then = (ok: any, bad: any) => Promise.resolve(resolve(ops)).then(ok, bad);
    return b;
  }
  return { client: { from: () => builder([]) } as any, writes, reads };
}

const vec = () => Array(768).fill(0.5);
const sleep = vi.fn(async () => {});
const deal = (id: string, created_at: string, extra: any = {}) => ({
  id,
  created_at,
  make: "Ford",
  model: "Explorer",
  year: 2019,
  ...extra,
});

beforeEach(() => vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test"));
afterEach(() => {
  vi.unstubAllEnvs();
  generate.mockReset();
  sleep.mockClear();
});

describe("Embedding backfill proof", () => {
  it("reports a database failure rather than successful zero work", async () => {
    await expect(
      backfillEmbeddings(
        database({ readError: { message: "unavailable" } }).client,
        50,
        { sleep },
      ),
    ).rejects.toThrow("inventory read failed");
  });

  it("rejects malformed vectors without writing them or claiming success", async () => {
    generate.mockResolvedValue([[1, 2, 3]]);
    const db = database({ missing: [deal("one", "2026-10-09")] });
    await expect(backfillEmbeddings(db.client, 50, { sleep })).rejects.toThrow(
      "made no progress",
    );
    expect(db.writes).toHaveLength(0);
  });

  it("skips cleanly (no provider calls) without an API key", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");
    const r = await backfillEmbeddings(database().client);
    expect(r).toEqual({ updated: 0, remaining: 0, skipped: true });
    expect(generate).not.toHaveBeenCalled();
  });

  it("stamps embedded_at + source hash and reports coverage", async () => {
    generate.mockResolvedValue([vec()]);
    const d = deal("one", "2026-10-09");
    const db = database({ missing: [d] });
    const r = await backfillEmbeddings(db.client, 50, { sleep });
    expect(r).toMatchObject({
      updated: 1,
      remaining: 6,
      skipped: false,
      schemaReady: true,
      byTier: { missing: 1, changed: 0, legacy: 0 },
      coverage: { active: 10, embedded: 4, fresh: 2, pct: 40 },
    });
    expect(db.writes[0].id).toBe("one");
    expect(db.writes[0].patch.embedding_source_hash).toBe(
      embeddingSourceHash(dealEmbeddingText(d)),
    );
    expect(Date.parse(db.writes[0].patch.embedded_at)).not.toBeNaN();
  });
});

describe("needs-embedding selection", () => {
  it("re-embeds missing, then changed, then legacy rows; skips current ones", async () => {
    const current = deal("current", "2026-10-09");
    const changed = deal("changed", "2026-10-03", {
      embedding_source_hash: "stale",
    });
    const legacy = deal("legacy", "2026-10-08", {
      embedding_source_hash: null,
    });
    current.embedding_source_hash = embeddingSourceHash(
      dealEmbeddingText(current),
    );
    generate.mockImplementation(async (texts: string[]) => texts.map(vec));
    const db = database({
      missing: [deal("new", "2026-10-07")],
      embedded: [current, legacy, changed],
    });
    const r = await backfillEmbeddings(db.client, 50, { sleep });
    expect(db.writes.map((w) => w.id)).toEqual(["new", "changed", "legacy"]);
    expect(r.byTier).toEqual({ missing: 1, changed: 1, legacy: 1 });
  });

  it("respects the per-run cap", async () => {
    generate.mockImplementation(async (texts: string[]) => texts.map(vec));
    const db = database({
      missing: [deal("a", "2026-10-09")],
      embedded: [deal("b", "2026-10-08"), deal("c", "2026-10-07")],
    });
    await backfillEmbeddings(db.client, 2, { sleep });
    expect(db.writes.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("does nothing once today's daily cap is spent", async () => {
    const db = database({ missing: [deal("a", "2026-10-09")], usedToday: 900 });
    const r = await backfillEmbeddings(db.client, 250, {
      sleep,
      dailyCap: 900,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(r).toMatchObject({ updated: 0, budgetExhausted: true });
  });

  it("falls back to missing-only mode before the migration is applied", async () => {
    generate.mockResolvedValue([vec()]);
    const db = database({
      missing: [deal("a", "2026-10-09")],
      embedded: [deal("legacy", "2026-10-08")],
      budgetError: {
        code: "42703",
        message: "column deals.embedded_at does not exist",
      },
    });
    const r = await backfillEmbeddings(db.client, 250, { sleep });
    expect(r.schemaReady).toBe(false);
    expect(r.budget?.runCap).toBe(112);
    expect(db.writes).toEqual([
      { id: "a", patch: { embedding: expect.any(String) } },
    ]);
    expect(r.coverage?.fresh).toBeNull();
  });
});

describe("throttle + quota handling", () => {
  it("batches 25 texts per call and paces between batches", async () => {
    generate.mockImplementation(async (texts: string[]) => texts.map(vec));
    const missing = Array.from({ length: 60 }, (_, i) =>
      deal(`d${i}`, `2026-10-${String(9 - (i % 9)).padStart(2, "0")}`),
    );
    const r = await backfillEmbeddings(database({ missing }).client, 250, {
      sleep,
    });
    expect(generate.mock.calls.map((c) => c[0].length)).toEqual([25, 25, 10]);
    expect(sleep).toHaveBeenCalledTimes(2);
    for (const [ms] of sleep.mock.calls as any)
      expect(ms).toBeGreaterThanOrEqual(20_000);
    expect(r.updated).toBe(60);
  });

  it("retries a per-minute 429 using RetryInfo, then succeeds", async () => {
    generate
      .mockRejectedValueOnce({
        statusCode: 429,
        responseBody:
          '{"error":{"status":"RESOURCE_EXHAUSTED","retryDelay": "10s"}}',
      })
      .mockResolvedValueOnce([vec()]);
    const r = await backfillEmbeddings(
      database({ missing: [deal("a", "2026-10-09")] }).client,
      50,
      { sleep },
    );
    expect(sleep).toHaveBeenCalledWith(11_000);
    expect(r).toMatchObject({ updated: 1, quotaExhausted: null });
  });

  it("stops cleanly (no throw, no retry) on daily quota exhaustion", async () => {
    generate.mockRejectedValue({
      statusCode: 429,
      responseBody:
        '{"quotaId":"EmbedContentRequestsPerDayPerUserPerProjectPerModel-FreeTier"}',
    });
    const r = await backfillEmbeddings(
      database({ missing: [deal("a", "2026-10-09"), deal("b", "2026-10-08")] })
        .client,
      50,
      { sleep },
    );
    expect(generate).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(r).toMatchObject({
      updated: 0,
      quotaExhausted: "daily",
      skipped: false,
    });
  });

  it("gives up on a persistent per-minute 429 after bounded retries", async () => {
    generate.mockRejectedValue({
      statusCode: 429,
      responseBody: "RESOURCE_EXHAUSTED",
    });
    const r = await backfillEmbeddings(
      database({ missing: [deal("a", "2026-10-09")] }).client,
      50,
      { sleep },
    );
    expect(generate).toHaveBeenCalledTimes(3);
    expect(r.quotaExhausted).toBe("rate");
  });
});
