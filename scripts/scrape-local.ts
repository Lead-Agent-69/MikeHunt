import "../workers/polyfill";
import dotenv from "dotenv";
import path from "node:path";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { format } from "node:util";
import {
  DEFAULT_MAX_DAILY_INSERTS,
  DEFAULT_MAX_DAILY_UPDATES,
  LocalScraperCache,
} from "../lib/scrapers/local-cache";
import { withLocalWriteContext } from "../lib/scrapers/local-write-context";
import { claimNextScopedScrapeJob } from "../lib/scrapers/job-queue";
import { summarizeScopedScrapeResults } from "../lib/scrapers/job-result";
import { startScopedJobHeartbeat } from "../lib/scrapers/job-heartbeat";
import {
  isAutomationAllowedSource,
  advanceSweep,
  claimBackoffMs,
  loadSweepState,
  nextSweepStep,
  resolveScraperExecutionMode,
  resolveSweepIntervalMs,
  optedInRestrictedSources,
  resolveSweepSources,
  saveSweepState,
  PRIMARY_DEAL_SOURCES,
  type ScraperExecutionMode,
} from "../lib/scrapers/sweep-schedule";
import type { LocalWriteContext } from "../lib/scrapers/local-write-context";
import {
  loadRotation,
  recordSweepPlan,
  resolveSweepStatesPerRun,
  resolveSweepZipsPerState,
  saveRotation,
  withSweepPlan,
} from "../lib/scrapers/sweep-plan";
import {
  type DemandRow,
  loadSourceHealth,
  planDemandSweep,
  recordSourceYield,
  saveSourceHealth,
  sourcesForSweep,
  startSweep,
  summarizeDemand,
  wantHitGapStates,
} from "../lib/scrapers/sweep-demand";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local.scraper") });
if (process.env.SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
}
if (
  process.env.CACHE_ONLY_MODE !== "true" &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY
) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY is required unless CACHE_ONLY_MODE=true",
  );
}

const MAX_PARALLEL = Math.max(
  1,
  Math.min(3, Number(process.env.MAX_PARALLEL_SOURCES || 3)),
);
const HOURS_BETWEEN_RUNS = Math.max(
  1,
  Number(process.env.HOURS_BETWEEN_RUNS || 12),
);
const STATUS_PATH = path.resolve(
  process.env.STATUS_PATH || "/app/logs/status.json",
);
const LOG_PATH = path.resolve(
  process.env.SCRAPER_LOG_PATH || "/app/logs/scraper.log",
);
const PORT = Math.max(1, Number(process.env.STATUS_PORT || 8787));

interface Status {
  state:
    | "starting"
    | "running"
    | "paused"
    | "quota_paused"
    | "stopping"
    | "stopped"
    | "error";
  updatedAt: string;
  startedAt: string;
  nextRunAt?: string;
  cacheOnly: boolean;
  currentSources: string[];
  completedSources: number;
  totalSources: number;
  progress: number;
  lastRun?: string;
  lastError?: string;
  activeJob?: {
    id: string;
    sourceIds: string[];
    requestedAt: string;
  };
  quota: ReturnType<LocalScraperCache["getQuota"]>;
  sweep?: {
    startedAt?: string;
    source?: string;
    position?: number;
    total?: number;
    nextAt?: string;
    states?: string[];
    demandStates?: string[];
    gapStates?: string[];
  };
  accessBarriers: {
    host: string;
    status: number;
    reason: string;
    at: string;
  }[];
  results: {
    source: string;
    success: boolean;
    dealsFound: number;
    duration: number;
    error?: string;
  }[];
}

const QUEUE_POLL_MS = Math.max(
  1_000,
  Number(process.env.REMOTE_QUEUE_POLL_MS || 5_000),
);
const WORKER_ID =
  process.env.SCRAPER_WORKER_ID || `mikehunt-docker-${process.pid}`;

let manualPaused = false;
let stopRequested = false;
let quotaPaused = false;
let shuttingDown = false;
let currentStatus!: Status;
let cache!: LocalScraperCache;
let logStream!: ReturnType<typeof createWriteStream>;
const startedAt = new Date().toISOString();
const statusDir = path.dirname(STATUS_PATH);

async function writeStatus(): Promise<void> {
  currentStatus.updatedAt = new Date().toISOString();
  currentStatus.quota = cache.getQuota();
  await mkdir(statusDir, { recursive: true });
  const tmp = `${STATUS_PATH}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(currentStatus, null, 2), { mode: 0o600 });
  await rename(tmp, STATUS_PATH);
}

function quotaReached(): boolean {
  const q = cache.getQuota();
  return (
    q.inserts >= Math.max(1, Math.floor(q.maxInserts * 0.8)) ||
    q.updates >= Math.max(1, Math.floor(q.maxUpdates * 0.8))
  );
}

async function waitUntilWritable(): Promise<boolean> {
  while (!stopRequested) {
    if (quotaReached()) {
      quotaPaused = true;
      return false;
    }
    if (!manualPaused) return true;
    currentStatus.state = "paused";
    await writeStatus();
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function waitForNextJob(): Promise<boolean> {
  while (!stopRequested) {
    const quotaNow = cache.getQuota();
    const hitQuota =
      quotaNow.inserts >= Math.max(1, Math.floor(quotaNow.maxInserts * 0.8)) ||
      quotaNow.updates >= Math.max(1, Math.floor(quotaNow.maxUpdates * 0.8));
    if (!hitQuota) quotaPaused = false;
    if (hitQuota) {
      quotaPaused = true;
      currentStatus.state = "quota_paused";
      await writeStatus();
      await new Promise((resolve) => setTimeout(resolve, 15_000));
      continue;
    }
    if (manualPaused) {
      currentStatus.state = "paused";
      await writeStatus();
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    return true;
  }
  return false;
}

async function respondJson(
  response: import("node:http").ServerResponse,
  code: number,
  value: unknown,
) {
  response.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  const pathname = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`,
  ).pathname;
  if (request.method === "GET" && pathname === "/") {
    try {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(
        await readFile(
          path.join(process.cwd(), "scripts", "scraper-local-dashboard.html"),
        ),
      );
    } catch {
      response.writeHead(500);
      response.end("Dashboard file missing");
    }
    return;
  }
  if (request.method === "GET" && pathname === "/status.json") {
    await writeStatus();
    response.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(JSON.stringify(currentStatus));
    return;
  }
  if (request.method === "POST" && pathname.startsWith("/control/")) {
    const parts = pathname.split("/");
    const command = parts[parts.length - 1];
    if (command === "pause") manualPaused = true;
    else if (command === "resume") {
      manualPaused = false;
      quotaPaused = quotaReached();
    } else if (command === "stop") {
      stopRequested = true;
      manualPaused = false;
    } else {
      await respondJson(response, 404, { error: "Unknown control" });
      return;
    }
    currentStatus.state = stopRequested
      ? "stopping"
      : manualPaused
        ? "paused"
        : "running";
    await writeStatus();
    await respondJson(response, 200, { ok: true, state: currentStatus.state });
    return;
  }
  await respondJson(response, 404, { error: "Not found" });
});

async function initializeRuntime(): Promise<void> {
  await mkdir(statusDir, { recursive: true });
  await mkdir(path.dirname(LOG_PATH), { recursive: true });
  logStream = createWriteStream(LOG_PATH, { flags: "a" });
  for (const level of ["log", "warn", "error"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      logStream.write(
        `${new Date().toISOString()} [${level.toUpperCase()}] ${format(...args)}\n`,
      );
      original(...args);
    };
  }
  cache = new LocalScraperCache({
    path: process.env.LOCAL_CACHE_PATH || "/app/cache",
    batchSize: Number(process.env.BATCH_SIZE || 50),
    maxDailyInserts: Number(
      process.env.MAX_DAILY_INSERTS || DEFAULT_MAX_DAILY_INSERTS,
    ),
    maxDailyUpdates: Number(
      process.env.MAX_DAILY_UPDATES || DEFAULT_MAX_DAILY_UPDATES,
    ),
    cacheOnly: process.env.CACHE_ONLY_MODE === "true",
    onQuota: (_quota, paused) => {
      quotaPaused = paused;
      void writeStatus();
    },
    beforeWrite: async () => waitUntilWritable(),
  });
  await cache.load();
  currentStatus = {
    state: "starting",
    updatedAt: new Date().toISOString(),
    startedAt,
    cacheOnly: process.env.CACHE_ONLY_MODE === "true",
    currentSources: [],
    completedSources: 0,
    totalSources: 0,
    progress: 0,
    quota: cache.getQuota(),
    accessBarriers: [],
    results: [],
  };
}

function buildLocalContext(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): LocalWriteContext {
  return {
    cache,
    supabase,
    cacheOnly: currentStatus.cacheOnly,
    beforeWrite: waitUntilWritable,
    respectAccessBlocks: true,
    onAccessBarrier: (barrier: {
      host: string;
      status: number;
      reason: string;
    }) => {
      currentStatus.accessBarriers = [
        { ...barrier, at: new Date().toISOString() },
        ...currentStatus.accessBarriers,
      ].slice(0, 100);
      void writeStatus();
    },
  };
}

/**
 * Hybrid idle tick: run ONE source of the broad sweep, through the local quota cache, then return
 * to the buyer queue. Returns false when no sweep work is due.
 */
async function runSweepTick(
  supabase: import("@supabase/supabase-js").SupabaseClient,
): Promise<boolean> {
  if (quotaReached()) return false;
  const { createScraperRegistry, runScrapers } =
    await import("../lib/scrapers/runner");
  const registry = createScraperRegistry();
  const sources = resolveSweepSources().filter((id) => {
    const source = registry.get(id);
    return Boolean(source && source.enabled && !source.requiresAuth);
  });
  const prior = await loadSweepState();
  const health = await loadSourceHealth();
  // Sources that keep coming back empty sit out some sweeps (2, 4, then 8). Only used for a new sweep.
  const priorGaps = Array.isArray(currentStatus.sweep?.gapStates)
    ? currentStatus.sweep!.gapStates!
    : [];
  const step = nextSweepStep(
    prior,
    sourcesForSweep(sources, health),
    resolveSweepIntervalMs(undefined, { hasRing0Gaps: priorGaps.length > 0 }),
  );
  if (step.kind === "idle") {
    currentStatus.sweep = {
      nextAt: step.nextAt,
      // Keep gap memory across idle ticks so the shortened interval stays armed.
      gapStates: priorGaps,
      demandStates: currentStatus.sweep?.demandStates,
    };
    return false;
  }
  if (!step.state.plan) {
    // New sweep: signed-in users' home/search states get demand slots; every other state keeps a
    // least-recently-swept baseline floor so nothing starves.
    const rotation = await loadRotation();
    const counts: Record<string, number> = {};
    try {
      const { data } = await supabase.rpc("count_by_state", {
        p_table: "deals",
        p_col: "location_state",
      });
      for (const row of (data || []) as { state: string; n: number }[])
        counts[String(row.state)] = Number(row.n) || 0;
    } catch {
      // Counts only break ties. Rotation alone still covers every state.
    }
    let demandRows: DemandRow[] = [];
    try {
      const { data, error } = await supabase.rpc("scrape_demand", {
        p_active_days: 30,
      });
      if (error) throw error;
      demandRows = (data || []) as DemandRow[];
    } catch (error) {
      // Missing RPC (not applied yet) or a network blip: plain rotation still covers every state.
      console.warn(
        `[sweep] demand unavailable, rotation only: ${(error as Error).message}`,
      );
    }
    const demand = summarizeDemand(demandRows);
    // Want-hit gaps: anchor states with < 5 active PRIMARY rows. One head-count per anchor per
    // sweep (a handful of cheap queries every few hours — Free-tier safe). Failure = no gap bias.
    let gaps: string[] = [];
    try {
      const primary = [...PRIMARY_DEAL_SOURCES];
      const anchors = (demand.anchors || []).slice(0, 12);
      const primaryCounts: Record<string, number> = {};
      for (const st of anchors) {
        // Only "≥ 5 rows?" matters, so read at most 5 ids instead of an exact count (a HEAD
        // count on the big deals table can time out on Free tier and returns no error body).
        const { data, error } = await supabase
          .from("deals")
          .select("id")
          .eq("active", true)
          .eq("location_state", st)
          .in("source", primary)
          .limit(5);
        if (error)
          throw new Error(error.message || error.code || JSON.stringify(error));
        primaryCounts[st] = (data || []).length;
      }
      gaps = wantHitGapStates({ anchors, primaryCounts, minRows: 5 });
      if (anchors.length)
        console.log(
          `[sweep] want-hit primary rows (capped at 5): ${anchors.map((st) => `${st}=${primaryCounts[st]}`).join(" ")}${gaps.length ? ` → gap-first: ${gaps.join(", ")}` : ""}`,
        );
    } catch (error) {
      console.warn(
        `[sweep] want-hit counts unavailable, no gap bias: ${(error as Error).message}`,
      );
    }
    const plan = planDemandSweep(rotation, {
      perSweep: resolveSweepStatesPerRun(),
      zipsPerState: resolveSweepZipsPerState(),
      counts,
      demand,
      gaps,
    });
    step.state.plan = { states: plan.states, zipsByState: plan.zipsByState };
    await saveRotation(recordSweepPlan(rotation, plan));
    await saveSourceHealth(startSweep(health));
    currentStatus.sweep = {
      ...currentStatus.sweep,
      demandStates: plan.demandStates,
      gapStates: plan.gapStates || [],
    };
    const restricted = optedInRestrictedSources(step.state.sources);
    if (restricted.length)
      console.warn(
        `[sweep] SCRAPE_SOURCES opts into sources whose terms ban automated access: ${restricted.join(", ")} (see TOS_RESTRICTED_SOURCES)`,
      );
    console.log(
      `[sweep] states this sweep: ${plan.states.join(", ")}${plan.demandStates.length ? ` (demand: ${plan.demandStates.join(", ")})` : ""}`,
    );
  }
  await saveSweepState(step.state);
  currentStatus.state = "running";
  currentStatus.currentSources = [step.source];
  currentStatus.sweep = {
    startedAt: step.state.startedAt,
    source: step.source,
    position: step.state.index + 1,
    total: step.state.sources.length,
    states: step.state.plan?.states,
    demandStates: currentStatus.sweep?.demandStates,
    gapStates: currentStatus.sweep?.gapStates,
  };
  currentStatus.lastRun = new Date().toISOString();
  await writeStatus();
  console.log(
    `[sweep] ${step.state.index + 1}/${step.state.sources.length} ${step.source}`,
  );
  try {
    const results = await withLocalWriteContext(
      buildLocalContext(supabase),
      () =>
        withSweepPlan(step.state.plan, () =>
          runScrapers({
            orchestrator: "sequential",
            sourceIds: [step.source],
          }),
        ),
    );
    currentStatus.results = [
      ...results,
      ...currentStatus.results.filter((r) => r.source !== step.source),
    ].slice(0, 50);
    let nextHealth = await loadSourceHealth();
    for (const result of results)
      nextHealth = recordSourceYield(
        nextHealth,
        result.source,
        Number(result.dealsFound) || 0,
        Boolean(result.success),
      );
    await saveSourceHealth(nextHealth);
    for (const result of results)
      console.log(
        `[sweep] ${result.source}: ${result.success ? "ok" : "failed"}, ${result.dealsFound} rows${result.error ? ` (${result.error})` : ""}`,
      );
  } catch (error) {
    // One broken source must not stall the sweep or the buyer queue.
    console.error(`[sweep] ${step.source} threw:`, (error as Error).message);
  } finally {
    const next = advanceSweep(step.state);
    await saveSweepState(next);
    if (!next.startedAt) {
      const { closeSmartFetch } = await import("../lib/scrapers/smart-fetch");
      await closeSmartFetch().catch(() => {});
      console.log(`[sweep] complete at ${next.lastCompletedAt}`);
    }
    currentStatus.currentSources = [];
    await writeStatus();
  }
  return true;
}

async function runCycle(): Promise<void> {
  const [
    { createScraperRegistry },
    { QueueOrchestrator },
    { closeSmartFetch },
  ] = await Promise.all([
    import("../lib/scrapers/runner"),
    import("../lib/scrapers/orchestrators/queue"),
    import("../lib/scrapers/smart-fetch"),
  ]);
  const registry = createScraperRegistry();
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || "cache-only-placeholder-key";
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const explicitSources = Boolean(process.env.SCRAPE_SOURCES?.trim());
  const sourceIds = resolveSweepSources();
  const unavailable = sourceIds.filter((id) => {
    const source = registry.get(id);
    return !source || !source.enabled || source.requiresAuth;
  });
  if (unavailable.length && explicitSources)
    throw new Error(
      `Sources unavailable, gated, or disabled in registry: ${unavailable.join(", ")}`,
    );
  const enabledSourceIds = explicitSources
    ? sourceIds
    : sourceIds.filter((id) => !unavailable.includes(id));
  if (!enabledSourceIds.length)
    throw new Error("No enabled unauthenticated sources are available to run");

  currentStatus.state = "running";
  currentStatus.currentSources = [];
  currentStatus.completedSources = 0;
  currentStatus.totalSources = enabledSourceIds.length;
  currentStatus.progress = 0;
  currentStatus.results = [];
  currentStatus.lastRun = new Date().toISOString();
  await writeStatus();
  console.log(
    `[local-scraper] cycle starting: ${enabledSourceIds.join(", ")}; concurrency=${MAX_PARALLEL}; cacheOnly=${currentStatus.cacheOnly}`,
  );

  const queueName = `MikeHunt:scraper:local:${process.pid}:${Date.now()}`;
  const orchestrator = new QueueOrchestrator(registry, {
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
    supabaseKey:
      process.env.SUPABASE_SERVICE_ROLE_KEY || "cache-only-placeholder-key",
    redisUrl: process.env.REDIS_URL || "redis://redis:6379",
    queueName,
    workerConcurrency: MAX_PARALLEL,
    retries: 0,
    maxAttempts: 1,
    jobTimeoutMs: Number(process.env.SCRAPER_JOB_TIMEOUT_MS || 900_000),
    stopWhenIdle: true,
    skipSupabaseRunTracking: true,
    waitForNextJob,
    onJobStart: (source) => {
      currentStatus.currentSources.push(source);
      void writeStatus();
    },
    onJobComplete: (result) => {
      currentStatus.currentSources = currentStatus.currentSources.filter(
        (source) => source !== result.source,
      );
      currentStatus.results.push(result);
      currentStatus.completedSources += 1;
      currentStatus.progress = Math.round(
        (currentStatus.completedSources /
          Math.max(1, currentStatus.totalSources)) *
          100,
      );
      void writeStatus();
    },
  });

  const localContext = buildLocalContext(supabase);
  try {
    await withLocalWriteContext(localContext, () =>
      orchestrator.run(enabledSourceIds),
    );
  } finally {
    await closeSmartFetch();
    await orchestrator.clearQueue().catch(() => {});
    await orchestrator.close();
  }
  currentStatus.currentSources = [];
  currentStatus.state = stopRequested
    ? "stopping"
    : quotaPaused
      ? "quota_paused"
      : manualPaused
        ? "paused"
        : "running";
  await writeStatus();
}

async function runQueuedJobLoop(mode: ScraperExecutionMode): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey)
    throw new Error(
      "Queue mode requires hosted NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    );
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { runScrapers } = await import("../lib/scrapers/runner");

  console.log(
    `[scrape-queue] ${WORKER_ID} polling buyer-scoped jobs every ${QUEUE_POLL_MS}ms (${mode})`,
  );
  let claimFailures = 0;
  let nextAuctionExpiryAt = 0;
  while (!stopRequested) {
    let job: Awaited<ReturnType<typeof claimNextScopedScrapeJob>>;
    try {
      job = await claimNextScopedScrapeJob(supabase, WORKER_ID);
      claimFailures = 0;
    } catch (error) {
      // A dropped connection to Supabase is transient. Back off and keep polling instead of
      // crashing the container into a restart loop.
      claimFailures += 1;
      const wait = claimBackoffMs(claimFailures);
      currentStatus.lastError = (error as Error).message;
      console.warn(
        `[scrape-queue] claim failed (${claimFailures}x), retrying in ${Math.round(wait / 1000)}s: ${(error as Error).message}`,
      );
      await writeStatus().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, wait));
      continue;
    }
    if (
      !job &&
      !manualPaused &&
      !currentStatus.cacheOnly &&
      !quotaReached() &&
      Date.now() >= nextAuctionExpiryAt
    ) {
      nextAuctionExpiryAt = Date.now() + 60 * 60_000;
      try {
        const count = await cache.deactivateEndedAuctions(supabase);
        console.log(
          `[retention] deactivated ${count} ended auctions; saved history retained`,
        );
        await writeStatus();
      } catch (error) {
        nextAuctionExpiryAt = Date.now() + 5 * 60_000;
        console.warn(
          "[retention] auction expiry failed:",
          (error as Error).message,
        );
      }
    }
    if (!job && mode === "hybrid" && !manualPaused) {
      try {
        if (await runSweepTick(supabase)) continue;
      } catch (error) {
        console.error("[sweep] tick failed:", (error as Error).message);
      }
    }
    if (!job) {
      currentStatus.state = manualPaused ? "paused" : "running";
      currentStatus.currentSources = [];
      currentStatus.activeJob = undefined;
      currentStatus.nextRunAt = new Date(
        Date.now() + QUEUE_POLL_MS,
      ).toISOString();
      await writeStatus();
      await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_MS));
      continue;
    }

    if (manualPaused) {
      await supabase
        .from("scrape_jobs")
        .update({ status: "pending", worker_id: null, started_at: null })
        .eq("id", job.id)
        .eq("worker_id", WORKER_ID);
      await new Promise((resolve) => setTimeout(resolve, QUEUE_POLL_MS));
      continue;
    }

    const requestedIds = Array.isArray(job.source_ids)
      ? job.source_ids.filter(Boolean)
      : [];
    // Hybrid buyer jobs must honor TOS_RESTRICTED_SOURCES the same way scrape-ci /
    // resolveSweepSources do when SCRAPE_SOURCES is empty: restricted ids only run on
    // explicit env opt-in, never because a lane plan named them.
    const heldBack = requestedIds.filter(
      (id) => !isAutomationAllowedSource(String(id)),
    );
    const sourceIds = requestedIds.filter((id) =>
      isAutomationAllowedSource(String(id)),
    );
    if (heldBack.length)
      console.warn(
        `[scrape-queue] holding back terms-restricted sources (need SCRAPE_SOURCES opt-in): ${heldBack.join(", ")}`,
      );
    currentStatus.state = "running";
    currentStatus.activeJob = {
      id: job.id,
      sourceIds,
      requestedAt: job.created_at,
    };
    currentStatus.currentSources = [];
    currentStatus.completedSources = 0;
    currentStatus.totalSources = sourceIds.length;
    currentStatus.progress = 0;
    currentStatus.results = [];
    currentStatus.lastRun = new Date().toISOString();
    currentStatus.lastError = undefined;
    await writeStatus();

    const stopHeartbeat = startScopedJobHeartbeat(
      supabase,
      job.id,
      WORKER_ID,
      (error) => {
        console.warn("[scrape-queue] heartbeat failed:", error);
      },
    );
    try {
      if (!sourceIds.length)
        throw new Error(
          heldBack.length
            ? `Queued job only named terms-restricted sources (${heldBack.join(", ")}); set SCRAPE_SOURCES to opt in or pick terms-safe sources`
            : "Queued job has no source ids",
        );
      const results = await runScrapers({
        orchestrator: job.orchestrator || "concurrent",
        sourceIds,
        scope: job.scope || {},
        concurrency: Math.min(3, Math.max(1, Number(job.concurrency || 1))),
        dryRun: Boolean(job.dry_run),
        onProgress: (progress) => {
          currentStatus.completedSources = progress.completed;
          currentStatus.totalSources = progress.total;
          currentStatus.progress = progress.percentage;
          currentStatus.currentSources = progress.currentSource
            ? [progress.currentSource]
            : [];
          void writeStatus();
        },
      });
      const summary = summarizeScopedScrapeResults(results);
      const succeeded = summary.successful > 0;
      const { data: completedJob, error } = await supabase
        .from("scrape_jobs")
        .update({
          status: succeeded ? "completed" : "failed",
          error_message: succeeded
            ? null
            : "None of the selected sources could be checked. Please retry or choose another source.",
          listings_found: summary.totalDeals,
          listings_saved: summary.totalSaved,
          result: summary,
          completed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("worker_id", WORKER_ID)
        .eq("status", "running")
        .select("id")
        .maybeSingle();
      if (error)
        throw new Error(`Could not complete queue job: ${error.message}`);
      if (!completedJob)
        throw new Error("Queue job is no longer owned by this worker");
      currentStatus.results = results;
      currentStatus.completedSources = results.length;
      currentStatus.progress = 100;
      console.log(
        `[scrape-queue] ${succeeded ? "completed" : "failed"} ${job.id}: ${summary.successful}/${summary.total} sources, ${summary.totalDeals} found, ${summary.totalSaved} saved`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      currentStatus.lastError = message;
      await supabase
        .from("scrape_jobs")
        .update({
          status: "failed",
          error_message: message.slice(0, 2_000),
          completed_at: new Date().toISOString(),
          heartbeat_at: new Date().toISOString(),
        })
        .eq("id", job.id)
        .eq("worker_id", WORKER_ID)
        .eq("status", "running");
      console.error(`[scrape-queue] failed ${job.id}:`, message);
    } finally {
      stopHeartbeat();
      currentStatus.activeJob = undefined;
      currentStatus.currentSources = [];
      await writeStatus();
    }
  }
}

async function main(): Promise<void> {
  const intervalMs = HOURS_BETWEEN_RUNS * 60 * 60 * 1000;
  while (!stopRequested) {
    try {
      await runCycle();
      currentStatus.lastError = undefined;
    } catch (error) {
      currentStatus.lastError = (error as Error).message;
      console.error("[local-scraper] cycle failed:", currentStatus.lastError);
      currentStatus.state = "error";
    }
    if (stopRequested) break;
    currentStatus.nextRunAt = new Date(Date.now() + intervalMs).toISOString();
    await writeStatus();
    const until = Date.now() + intervalMs;
    while (!stopRequested && Date.now() < until) {
      if (manualPaused) {
        currentStatus.state = "paused";
        await writeStatus();
      } else if (currentStatus.state !== "error") {
        currentStatus.state = "running";
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  stopRequested = true;
  manualPaused = false;
  currentStatus.state = "stopping";
  console.log(
    `[local-scraper] received ${signal}; finishing active sources and shutting down`,
  );
  await writeStatus();
  // The active cycle observes stopRequested between jobs and before each database batch.
}
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void initializeRuntime()
  .then(() => {
    server.listen(PORT, "0.0.0.0", () =>
      console.log(`[local-scraper] dashboard listening on ${PORT}`),
    );
    const mode = resolveScraperExecutionMode();
    return mode === "direct" ? main() : runQueuedJobLoop(mode);
  })
  .catch((error) => {
    if (currentStatus) {
      currentStatus.state = "error";
      currentStatus.lastError = (error as Error).message;
    }
    console.error("[local-scraper] fatal:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (currentStatus) {
      currentStatus.state = "stopped";
      await writeStatus().catch(() => {});
    }
    server.close();
    logStream?.end();
  });
