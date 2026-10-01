import "../workers/polyfill";
import dotenv from "dotenv";
import path from "node:path";
import { createServer } from "node:http";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { format } from "node:util";
import { LocalScraperCache } from "../lib/scrapers/local-cache";
import { withLocalWriteContext } from "../lib/scrapers/local-write-context";

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

const DEFAULT_SOURCES = [
  "craigslist",
  "carvana",
  "autotempest",
  "ebay_sold",
  "publicsurplus",
  "cars_com",
  "autotrader",
  "cargurus",
  "ebay_motors",
  "independent_dealer",
  "curated_dealers",
  "copart",
];
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
  quota: ReturnType<LocalScraperCache["getQuota"]>;
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
  const tmp = `${STATUS_PATH}.${process.pid}.tmp`;
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
    maxDailyInserts: Number(process.env.MAX_DAILY_INSERTS || 400),
    maxDailyUpdates: Number(process.env.MAX_DAILY_UPDATES || 600),
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
  const requested = explicitSources
    ? process.env
        .SCRAPE_SOURCES!.split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : DEFAULT_SOURCES;
  const sourceIds = Array.from(new Set(requested));
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

  const localContext = {
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
    return main();
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
