import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CURATED_OUTCOME_LIMIT,
  finishCuratedOutcome,
  loadCuratedOutcomes,
  parseCuratedOutcomes,
  recordCuratedOutcome,
  startCuratedOutcome,
} from "./curated-outcomes";

describe("truthful curated source outcomes", () => {
  const attempt = () =>
    startCuratedOutcome(
      "https://www.dealer.example/inventory?q=private",
      ["MO"],
      100,
    );
  it("records host and requested states without search text, credentials or full URLs", () => {
    expect(attempt()).toEqual({
      host: "dealer.example",
      state: "running",
      startedAt: 100,
      finishedAt: null,
      acceptedRecords: null,
      matchingInventory: null,
      requestedStates: ["MO"],
    });
  });
  it("does not turn zero adapter writes into no matching inventory or live coverage", () => {
    const result = finishCuratedOutcome(attempt(), 0, undefined, 110);
    expect(result.state).toBe("no_accepted_records");
    expect(result.matchingInventory).toBeNull();
    expect(
      finishCuratedOutcome(attempt(), 4, undefined, 110).matchingInventory,
    ).toBeNull();
  });
  it.each([
    ["blocked", "site_policy"],
    ["blocked", "robots"],
    ["failed", "timeout"],
    ["failed", "request_failed"],
    ["cancelled", "aborted"],
  ] as const)(
    "keeps %s / %s distinct from successful zero writes",
    (state, reason) => {
      expect(finishCuratedOutcome(attempt(), state, reason, 110)).toMatchObject(
        { state, reason, acceptedRecords: null, finishedAt: 110 },
      );
    },
  );
  it("rejects invalid counts and strips untrusted fields and claimed inventory", () => {
    for (const count of [-1, NaN, Infinity, 0.5])
      expect(() => finishCuratedOutcome(attempt(), count)).toThrow();
    const value = parseCuratedOutcomes({
      version: 1,
      rows: [
        {
          ...finishCuratedOutcome(attempt(), 1),
          matchingInventory: 500,
          secret: "private",
          requestedStates: ["MO", "MO", "bad", 123],
        },
      ],
    });
    expect(value.rows[0].matchingInventory).toBeNull();
    expect(value.rows[0]).not.toHaveProperty("secret");
    expect(value.rows[0].requestedStates).toEqual(["MO"]);
  });
  it("bounds storage and rejects corrupt state combinations", () => {
    const valid = finishCuratedOutcome(attempt(), 1, undefined, 110);
    const rows = Array.from({ length: 600 }, (_, i) => ({
      ...valid,
      host: `dealer-${i}.example`,
      startedAt: i + 1,
      finishedAt: i + 2,
    }));
    expect(parseCuratedOutcomes({ version: 1, rows }).rows).toHaveLength(
      CURATED_OUTCOME_LIMIT,
    );
    expect(
      parseCuratedOutcomes({
        version: 1,
        rows: [
          { ...valid, state: "accepted_records", acceptedRecords: 0 },
          { ...valid, state: "running" },
          { ...valid, state: "failed", acceptedRecords: 1 },
          { ...valid, host: "https://secret.example/path" },
          { ...valid, state: "live" },
        ],
      }).rows,
    ).toEqual([]);
  });
  it("persists across restart, serializes overlapping updates and rejects stale completion", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "curated-outcomes-"));
    const file = path.join(dir, "outcomes.json");
    try {
      expect((await loadCuratedOutcomes(file)).rows).toEqual([]);
      const old = attempt();
      const newer = startCuratedOutcome("https://dealer.example", ["KS"], 200);
      const other = startCuratedOutcome("https://other.example", ["MO"], 150);
      await Promise.all([
        recordCuratedOutcome(newer, file),
        recordCuratedOutcome(other, file),
        recordCuratedOutcome(
          finishCuratedOutcome(old, 4, undefined, 300),
          file,
        ),
      ]);
      const stored = await loadCuratedOutcomes(file);
      expect(stored.rows).toHaveLength(2);
      expect(stored.rows[0]).toMatchObject({
        state: "running",
        requestedStates: ["KS"],
        acceptedRecords: null,
      });
      // An interrupted attempt remains running/unfinished, never automatically successful.
      expect(JSON.parse(await readFile(file, "utf8"))).toEqual(stored);
      await writeFile(file, "corrupt");
      expect((await loadCuratedOutcomes(file)).rows).toEqual([]);
      await recordCuratedOutcome(finishCuratedOutcome(newer, 0), file);
      expect((await loadCuratedOutcomes(file)).rows[0].state).toBe(
        "no_accepted_records",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
