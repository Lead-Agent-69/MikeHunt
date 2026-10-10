/**
 * Gap audit section II (reliability & operations): job-level failure log, outcome, dead letters,
 * source breaker (pause, never disable), scan mode, version stamp, SLA rows, per-source tuning.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  MAX_DEAD_LETTERS_PER_RUN,
  MAX_ERROR_SAMPLES_PER_RUN,
  classifyFetchError,
  classifyHttpStatus,
  compactPayload,
  deadLetter,
  deriveOutcome,
  errorCounts,
  newRunTelemetry,
  recordError,
  recordFetchFailure,
  recordResponse,
  withRunTelemetry,
} from "./run-telemetry";
import { resolveScraperVersion } from "./version";
import {
  breakerPolicy,
  breakerTransitions,
  cooldownMs,
  pauseStateOf,
  summarizeRunStates,
} from "./source-breaker";
import { decideScanMode } from "./scan-mode";
import {
  isMissingSchemaError,
  resetRunLogState,
  runSummaryColumns,
  updateRunRow,
  writeRunTelemetry,
} from "./run-log";
import { mapSlaRow, slaStatus } from "./sla";
import { DomainLimiter } from "../polite/limiter";
import { DomainBreaker } from "../polite/breaker";
import { MemoryPageCache } from "../polite/cache";
import { PoliteCrawler, resetPoliteCrawler } from "../polite/polite-fetch";
import { overrideFromSource } from "../polite/source-limits";
import { noteEmptyFirstPage, parseWithTelemetry } from "../engine";

afterEach(() => {
  resetPoliteCrawler();
  resetRunLogState();
  vi.restoreAllMocks();
});

describe("run telemetry: failures captured where they happen", () => {
  it("classifies HTTP statuses and fetch errors", () => {
    expect(classifyHttpStatus(200)).toBeNull();
    expect(classifyHttpStatus(304)).toBeNull();
    expect(classifyHttpStatus(403)).toBe("http_403");
    expect(classifyHttpStatus(429)).toBe("http_429");
    expect(classifyHttpStatus(404)).toBe("http_4xx");
    expect(classifyHttpStatus(503)).toBe("http_5xx");
    expect(
      classifyFetchError(
        Object.assign(new Error("x"), { name: "TimeoutError" }),
      ),
    ).toBe("timeout");
    expect(
      classifyFetchError(
        Object.assign(new Error("getaddrinfo ENOTFOUND a.b"), {
          code: "ENOTFOUND",
        }),
      ),
    ).toBe("dns");
    expect(classifyFetchError(new Error("socket hang up"))).toBe("network");
  });

  it("is a no-op outside a run scope", () => {
    expect(() => recordError("parse")).not.toThrow();
    expect(() => deadLetter("x")).not.toThrow();
  });

  it("keeps concurrent source runs apart (AsyncLocalStorage)", async () => {
    const a = newRunTelemetry("a");
    const b = newRunTelemetry("b");
    await Promise.all([
      withRunTelemetry(a, async () => {
        await new Promise((r) => setTimeout(r, 5));
        recordResponse("https://a.example/x", 403);
      }),
      withRunTelemetry(b, async () => {
        recordFetchFailure(
          "https://b.example/x",
          Object.assign(new Error("t"), { name: "TimeoutError" }),
        );
        await new Promise((r) => setTimeout(r, 1));
        recordResponse("https://b.example/y", 200);
      }),
    ]);
    expect(errorCounts(a)).toEqual({ http_403: 1 });
    expect(errorCounts(b)).toEqual({ timeout: 1 });
    expect(b.ok).toBe(1);
    expect(a.samples[0].url).toBe("https://a.example/x");
  });

  it("caps samples and dead letters per run, and dead letters at 2 KB", async () => {
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => {
      for (let i = 0; i < 100; i++)
        recordError("parse", { url: `https://x.example/${i}?q=secret` });
      for (let i = 0; i < 80; i++)
        deadLetter("validation: price", {
          raw: "a".repeat(10_000),
          payload: { make: "Ford", description: "long" },
        });
    });
    expect(t.errors.parse).toBe(100);
    expect(t.samples).toHaveLength(MAX_ERROR_SAMPLES_PER_RUN);
    expect(t.samples[0].url).toBe("https://x.example/0"); // query stripped
    expect(t.deadLetters).toHaveLength(MAX_DEAD_LETTERS_PER_RUN);
    expect(t.deadLettersDropped).toBe(30);
    expect(Buffer.byteLength(t.deadLetters[0].rawSnippet!)).toBeLessThanOrEqual(
      2048,
    );
    expect(t.deadLetters[0].payload).toEqual({ make: "Ford" });
    const big = compactPayload(
      Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`k${i}`, "v".repeat(290)]),
      ),
    );
    expect(Buffer.byteLength(JSON.stringify(big))).toBeLessThanOrEqual(2048);
  });

  it("derives an honest outcome instead of 'success, 0 deals'", () => {
    const t = (f: (x: ReturnType<typeof newRunTelemetry>) => void) => {
      const x = newRunTelemetry("s");
      f(x);
      return x;
    };
    expect(
      deriveOutcome(
        t(() => {}),
        5,
        true,
      ),
    ).toBe("ok");
    expect(
      deriveOutcome(
        t((x) => (x.notModified = 3)),
        0,
        true,
      ),
    ).toBe("unchanged");
    expect(
      deriveOutcome(
        t((x) => (x.errors.challenge = 1)),
        0,
        true,
      ),
    ).toBe("challenged");
    expect(
      deriveOutcome(
        t((x) => (x.errors.http_403 = 2)),
        0,
        true,
      ),
    ).toBe("blocked");
    expect(
      deriveOutcome(
        t((x) => (x.errors.robots = 1)),
        0,
        true,
      ),
    ).toBe("blocked");
    expect(
      deriveOutcome(
        t((x) => (x.errors.timeout = 1)),
        0,
        true,
      ),
    ).toBe("failed");
    expect(
      deriveOutcome(
        t((x) => (x.errors.parse_empty = 1)),
        0,
        true,
      ),
    ).toBe("failed");
    expect(
      deriveOutcome(
        t(() => {}),
        0,
        true,
      ),
    ).toBe("empty");
    expect(
      deriveOutcome(
        t(() => {}),
        0,
        false,
      ),
    ).toBe("failed");
  });
});

describe("politeFetch records into the run (before the processor)", () => {
  function crawler(routes: Record<string, () => Response | Promise<Response>>) {
    return new PoliteCrawler({
      fetchImpl: async (url) => {
        const h = routes[new URL(url).pathname];
        return h ? h() : new Response("ok", { status: 200 });
      },
      sleep: async () => {},
      random: () => 0,
      now: () => 0,
      limiter: new DomainLimiter({
        sleep: async () => {},
        minGapMs: 0,
        domainFloorMs: () => 0,
      }),
      breaker: new DomainBreaker({ threshold: 99 }),
      cache: new MemoryPageCache(),
    });
  }

  it("403, robots skip, challenge, timeout and same-content 200 are all counted", async () => {
    const c = crawler({
      "/robots.txt": () => new Response("User-agent: *\nDisallow: /private"),
      "/forbidden": () => new Response("no", { status: 403 }),
      "/walled": () =>
        new Response("<title>Just a moment...</title> cf-chl", { status: 200 }),
      "/slow": () => {
        throw Object.assign(
          new Error("The operation was aborted due to timeout"),
          { name: "TimeoutError" },
        );
      },
      "/inv": () => new Response("<li>car</li>", { status: 200 }),
    });
    const t = newRunTelemetry("new_dealer");
    await withRunTelemetry(t, async () => {
      await c.fetch("https://new-dealer.example/forbidden", { maxRetries: 0 });
      await c.fetch("https://new-dealer.example/private/x");
      await c.fetch("https://other-dealer.example/walled");
      await c.fetch("https://third.example/slow", { maxRetries: 0 });
      await c.fetch("https://fourth.example/inv");
      const again = await c.fetch("https://fourth.example/inv");
      expect(again.unchanged).toBe(true);
    });
    expect(errorCounts(t)).toEqual({
      http_403: 1,
      robots: 1,
      challenge: 1,
      timeout: 1,
    });
    expect(t.ok).toBe(2);
    expect(t.unchanged).toBe(1);
  });
});

describe("parse failures become errors + dead letters", () => {
  it("a parser throw is recorded with a snippet; an empty page 1 is parse_empty", async () => {
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => {
      await expect(
        parseWithTelemetry(
          async () => {
            throw new Error("selector .price missing");
          },
          "<html>" + "x".repeat(5000),
          "https://d.example/inv?page=1",
        ),
      ).rejects.toThrow(/selector/);
      noteEmptyFirstPage({ items: [] }, "https://d.example/inv", 1, 1200);
      noteEmptyFirstPage({ items: [] }, "https://d.example/inv?p=2", 2, 1200);
    });
    expect(errorCounts(t)).toEqual({ parse: 1, parse_empty: 1 });
    expect(t.deadLetters[0].reason).toMatch(/^parse: selector/);
    expect(t.deadLetters[0].rawSnippet!.startsWith("<html>")).toBe(true);
  });
});

describe("source breaker: 5 failures pause, exponential cooldown, never disable", () => {
  const P = {
    threshold: 5,
    baseCooldownMs: 60 * 60_000,
    maxCooldownMs: 24 * 3_600_000,
  };
  it("cooldown doubles past the threshold and is capped", () => {
    expect(cooldownMs(4, P)).toBe(0);
    expect(cooldownMs(5, P)).toBe(60 * 60_000);
    expect(cooldownMs(6, P)).toBe(120 * 60_000);
    expect(cooldownMs(8, P)).toBe(480 * 60_000);
    expect(cooldownMs(20, P)).toBe(24 * 3_600_000);
  });

  it("defaults come from env; registry polite tuning overrides", () => {
    expect(breakerPolicy("x", {}).threshold).toBe(5);
    expect(
      breakerPolicy("x", { SCRAPER_BREAKER_THRESHOLD: "3" }).threshold,
    ).toBe(3);
    expect(
      breakerPolicy("x", {}, { breakerThreshold: 8, breakerCooldownMin: 15 }),
    ).toMatchObject({
      threshold: 8,
      baseCooldownMs: 15 * 60_000,
    });
  });

  const run = (
    h: number,
    outcome: string | null,
    status = "success",
    deals = 0,
  ) => ({
    source: "s",
    status,
    outcome,
    deals_found: deals,
    started_at: new Date(Date.UTC(2026, 9, 10, h)).toISOString(),
  });

  it("counts consecutive failures from scraper_runs (legacy rows use success+rows)", () => {
    const states = summarizeRunStates([
      run(1, null, "success", 10),
      run(2, "failed"),
      run(3, "blocked"),
      run(4, null, "success", 0),
      run(5, "challenged"),
      run(6, "empty"),
      { ...run(7, null, "running"), status: "running" },
    ]);
    expect(states.get("s")).toMatchObject({
      consecutiveFailures: 5,
      lastRunAt: run(6, "").started_at,
    });
    expect(
      summarizeRunStates([run(1, "failed"), run(2, "unchanged")]).get("s")!
        .consecutiveFailures,
    ).toBe(0);
  });

  it("pauses until lastRun + cooldown, then retries automatically", () => {
    const last = Date.UTC(2026, 9, 10, 6);
    const st = {
      source: "s",
      consecutiveFailures: 5,
      lastRunAt: new Date(last).toISOString(),
    };
    expect(pauseStateOf(st, last + 30 * 60_000, P).paused).toBe(true);
    expect(pauseStateOf(st, last + 61 * 60_000, P).paused).toBe(false);
    expect(
      pauseStateOf({ ...st, consecutiveFailures: 4 }, last + 1, P).paused,
    ).toBe(false);
  });

  it("alerts on open/escalate and on recovery", () => {
    const before = new Map([
      [
        "a",
        {
          source: "a",
          consecutiveFailures: 4,
          lastRunAt: null,
          lastSuccessAt: null,
          lastFullScanAt: null,
        },
      ],
      [
        "b",
        {
          source: "b",
          consecutiveFailures: 6,
          lastRunAt: null,
          lastSuccessAt: null,
          lastFullScanAt: null,
        },
      ],
    ]);
    const now = Date.now();
    const after = new Map([
      [
        "a",
        {
          source: "a",
          consecutiveFailures: 5,
          lastRunAt: new Date(now).toISOString(),
          lastSuccessAt: null,
          lastFullScanAt: null,
        },
      ],
      [
        "b",
        {
          source: "b",
          consecutiveFailures: 0,
          lastRunAt: new Date(now).toISOString(),
          lastSuccessAt: null,
          lastFullScanAt: null,
        },
      ],
    ]);
    const alerts = breakerTransitions(before, after, ["a", "b"], now);
    expect(alerts.map((x) => [x.source, x.kind])).toEqual([
      ["a", "circuit_open"],
      ["b", "circuit_closed"],
    ]);
    expect(alerts[0].message).toMatch(/Not removed or disabled/);
  });
});

describe("incremental vs full scan", () => {
  const now = Date.UTC(2026, 9, 10, 12);
  it("off by default; opt-in runs incremental between daily full rescans", () => {
    expect(
      decideScanMode(
        "craigslist",
        new Date(now - 3_600_000).toISOString(),
        now,
        {},
      ),
    ).toBe("full");
    const env = { SCRAPER_INCREMENTAL_SOURCES: "craigslist" };
    expect(
      decideScanMode(
        "craigslist",
        new Date(now - 3_600_000).toISOString(),
        now,
        env,
      ),
    ).toBe("incremental");
    expect(
      decideScanMode(
        "craigslist",
        new Date(now - 25 * 3_600_000).toISOString(),
        now,
        env,
      ),
    ).toBe("full");
    expect(decideScanMode("craigslist", null, now, env)).toBe("full");
    expect(
      decideScanMode(
        "craigslist",
        new Date(now - 7 * 3_600_000).toISOString(),
        now,
        { ...env, SCRAPER_FULL_RESCAN_HOURS: "6" },
      ),
    ).toBe("full");
  });
});

describe("scraper version stamp", () => {
  it("env, then .scraper-version.json, then .git, else unknown", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ver-"));
    expect(resolveScraperVersion({}, dir)).toEqual({
      gitSha: null,
      builtAt: null,
      source: "unknown",
    });
    mkdirSync(path.join(dir, ".git/refs/heads"), { recursive: true });
    writeFileSync(path.join(dir, ".git/HEAD"), "ref: refs/heads/main\n");
    writeFileSync(
      path.join(dir, ".git/refs/heads/main"),
      "a".repeat(40) + "\n",
    );
    expect(resolveScraperVersion({}, dir)).toMatchObject({
      gitSha: "a".repeat(40),
      source: "git",
    });
    writeFileSync(
      path.join(dir, ".scraper-version.json"),
      JSON.stringify({
        gitSha: "b".repeat(40),
        builtAt: "2026-10-10T07:00:00Z",
      }),
    );
    expect(resolveScraperVersion({}, dir)).toEqual({
      gitSha: "b".repeat(40),
      builtAt: "2026-10-10T07:00:00.000Z",
      source: "file",
    });
    expect(
      resolveScraperVersion({ SCRAPER_GIT_SHA: "c".repeat(12) }, dir),
    ).toMatchObject({ gitSha: "c".repeat(12), source: "env" });
    expect(
      resolveScraperVersion({ SCRAPER_GIT_SHA: "not-a-sha" }, dir).source,
    ).toBe("file");
  });
});

describe("run row write", () => {
  function fakeSb(failColumns: boolean) {
    const updates: any[] = [];
    const inserts: Record<string, any[]> = {};
    const sb: any = {
      from: (table: string) => ({
        update: (patch: any) => {
          updates.push(patch);
          const chain: any = {
            eq: () => chain,
            then: (r: any) =>
              r(
                failColumns && "outcome" in patch
                  ? {
                      error: {
                        code: "PGRST204",
                        message: "Could not find the 'outcome' column",
                      },
                    }
                  : { error: null },
              ),
          };
          return chain;
        },
        insert: async (rows: any[]) => {
          inserts[table] = rows;
          return { error: null };
        },
      }),
    };
    return { sb, updates, inserts };
  }

  it("writes outcome/error_counts/git_sha, and falls back to base columns before the migration", async () => {
    const t = newRunTelemetry("s");
    t.errors.http_403 = 2;
    const summary = runSummaryColumns(t, 0, true, {
      gitSha: "abc1234",
      builtAt: null,
      source: "env",
    });
    expect(summary).toMatchObject({
      outcome: "blocked",
      error_counts: { http_403: 2 },
      git_sha: "abc1234",
    });
    const ok = fakeSb(false);
    expect(
      await updateRunRow(ok.sb, "id1", { status: "success" }, summary),
    ).toBeNull();
    expect(ok.updates[0]).toMatchObject({
      status: "success",
      outcome: "blocked",
    });
    const old = fakeSb(true);
    expect(
      await updateRunRow(old.sb, "id1", { status: "success" }, summary),
    ).toBeNull();
    expect(old.updates.map((u) => "outcome" in u)).toEqual([true, false]);
    expect(
      isMissingSchemaError({
        code: "42P01",
        message: "relation does not exist",
      }),
    ).toBe(true);
  });

  it("inserts error samples and dead letters with the run id", async () => {
    const t = newRunTelemetry("s");
    await withRunTelemetry(t, async () => {
      recordError("parse", { url: "https://x.example/a" });
      deadLetter("validation: price", {
        url: "https://x.example/a",
        payload: { make: "Ford" },
      });
    });
    const f = fakeSb(false);
    expect(await writeRunTelemetry(f.sb, "run-1", t)).toEqual({
      errors: 1,
      deadLetters: 1,
    });
    expect(f.inserts.scraper_errors[0]).toMatchObject({
      run_id: "run-1",
      source: "s",
      error_class: "parse",
    });
    expect(f.inserts.scraper_dead_letters[0]).toMatchObject({
      run_id: "run-1",
      reason: "validation: price",
      payload: { make: "Ford" },
    });
  });
});

describe("SLA rows", () => {
  it("maps the view and derives status", () => {
    const now = Date.now();
    const row = mapSlaRow(
      {
        source: "craigslist",
        consecutive_failures: 5,
        last_run_at: new Date(now - 10 * 60_000).toISOString(),
        active_rows: 100,
        live_rows: 80,
        freshness_pct: 80,
        challenged_7d: 2,
        blocked_7d: 1,
        last_git_sha: "abc1234",
      },
      now,
    );
    expect(row).toMatchObject({
      status: "paused",
      frozenRows: 20,
      freshnessPct: 80,
      gitSha: "abc1234",
      breakerThreshold: 5,
    });
    expect(
      slaStatus(
        { consecutiveFailures: 0, pausedUntil: null, lastOutcome: "unchanged" },
        5,
      ),
    ).toBe("unchanged");
    expect(
      slaStatus(
        { consecutiveFailures: 2, pausedUntil: null, lastOutcome: "failed" },
        5,
      ),
    ).toBe("degraded");
  });
});

describe("per-source polite tuning from the registry", () => {
  it("polite.* overrides the defaults per domain; Crawl-delay stays the floor", () => {
    const o = overrideFromSource({
      url: "https://slow.example",
      polite: {
        minGapMs: 10_000,
        maxConcurrent: 5,
        jitterRatio: 0.2,
        breakerPauseHours: 2,
        challengeBackoffMin: 90,
      },
    } as any)!;
    expect(o).toEqual({
      minGapMs: 10_000,
      maxConcurrent: 2,
      jitterRatio: 0.2,
      breakerPauseMs: 2 * 3_600_000,
      challengeBackoffMs: 90 * 60_000,
    });
    const l = new DomainLimiter({
      minGapMs: 3_000,
      random: () => 1,
      domainOverride: (d) =>
        d === "slow.example" ? { minGapMs: 1_000, jitterRatio: 0 } : {},
    });
    expect(l.gapMs("slow.example")).toBe(1_000); // can go below the worker default...
    l.setCrawlDelay("slow.example", 5);
    expect(l.gapMs("slow.example")).toBe(5_000); // ...never below the site's Crawl-delay
    expect(l.gapMs("other.example")).toBe(6_000);
    const b = new DomainBreaker({
      threshold: 1,
      pauseMsFor: (d) => (d === "slow.example" ? 60_000 : undefined),
    });
    b.recordBanSignal("slow.example", 429, 0);
    expect(b.pausedUntil("slow.example")).toBe(60_000);
  });
});
