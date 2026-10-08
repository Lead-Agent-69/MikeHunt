import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  claimNextScopedScrapeJob,
  enqueueScopedScrapeJob,
  isRemoteScrapeQueueEnabled,
} from "./job-queue";

function chain(terminal: Record<string, unknown>) {
  const api: Record<string, any> = {};
  for (const method of [
    "select",
    "eq",
    "in",
    "order",
    "limit",
    "insert",
    "contains",
  ]) {
    api[method] = vi.fn(() => api);
  }
  api.maybeSingle = vi.fn(async () => terminal.maybeSingle);
  api.single = vi.fn(async () => terminal.single);
  return api;
}

describe("buyer-scoped scrape queue", () => {
  it("removes the legacy allow-all job policy", () => {
    const migration = readFileSync(
      "supabase/migrations/20261003060000_lock_scrape_jobs_rls.sql",
      "utf8",
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Allow service role full access"',
    );
    expect(migration).toContain(
      'DROP POLICY IF EXISTS "Allow public read access"',
    );
  });

  it("is opt-in so local development keeps its direct run path", () => {
    const prior = process.env.SCRAPER_EXECUTION_MODE;
    delete process.env.SCRAPER_EXECUTION_MODE;
    expect(isRemoteScrapeQueueEnabled()).toBe(false);
    process.env.SCRAPER_EXECUTION_MODE = "queue";
    expect(isRemoteScrapeQueueEnabled()).toBe(true);
    process.env.SCRAPER_EXECUTION_MODE = "hybrid";
    expect(isRemoteScrapeQueueEnabled()).toBe(true);
    if (prior === undefined) delete process.env.SCRAPER_EXECUTION_MODE;
    else process.env.SCRAPER_EXECUTION_MODE = prior;
  });

  it("returns an active user job instead of adding duplicate work", async () => {
    const existing = {
      id: "job-1",
      status: "running",
      requested_by: "user-1",
      source_ids: ["curated_dealers"],
      scope: { state: "FL" },
      orchestrator: "concurrent",
      concurrency: 1,
      dry_run: false,
      created_at: new Date().toISOString(),
    };
    const query = chain({
      maybeSingle: { data: existing, error: null },
      single: { data: null, error: null },
    });
    const supabase = { from: vi.fn(() => query) } as any;

    const result = await enqueueScopedScrapeJob(supabase, {
      requestedBy: "user-1",
      sourceIds: ["curated_dealers"],
      scope: { state: "FL" },
      orchestrator: "concurrent",
      concurrency: 1,
    });

    expect(result).toEqual({ job: existing, deduplicated: true });
    expect(query.insert).not.toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith(
      "scope",
      JSON.stringify({ state: "FL" }),
    );
    expect(query.eq).toHaveBeenCalledWith("dry_run", false);
    expect(query.contains).toHaveBeenCalledWith("source_ids", [
      "curated_dealers",
    ]);
  });

  it("does not reuse a job with additional unselected sources", async () => {
    const query = chain({
      maybeSingle: {
        data: { source_ids: ["curated_dealers", "gsa_auctions"] },
        error: null,
      },
      single: { data: { id: "new-job" }, error: null },
    });
    const result = await enqueueScopedScrapeJob({ from: () => query } as any, {
      requestedBy: "user-1",
      sourceIds: ["curated_dealers"],
      scope: { state: "MO" },
      orchestrator: "concurrent",
      concurrency: 1,
    });
    expect(result.deduplicated).toBe(false);
    expect(query.insert).toHaveBeenCalled();
  });

  it("claims through the atomic database function", async () => {
    const job = { id: "job-2", status: "running" };
    const rpc = vi.fn(async () => ({ data: [job], error: null }));
    const result = await claimNextScopedScrapeJob({ rpc } as any, "worker-1");
    expect(rpc).toHaveBeenCalledWith("claim_next_scrape_job", {
      p_worker_id: "worker-1",
    });
    expect(result).toEqual(job);
  });
});
