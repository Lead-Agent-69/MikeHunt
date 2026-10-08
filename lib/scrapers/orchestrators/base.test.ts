import { describe, expect, it, vi } from "vitest";
import { BaseScraperOrchestrator } from "./base";

class TestOrchestrator extends BaseScraperOrchestrator {
  async run() {
    return [];
  }
  async stop() {}
  setClient(client: any) {
    this.supabase = client;
    this.options.dryRun = false;
  }
  complete() {
    return this.logScrapeComplete("run-id", "source", 2, 1, 100);
  }
  fail() {
    return this.logScrapeError("run-id", new Error("interrupted"));
  }
}

describe("source-run terminal ownership", () => {
  it("never overwrites a recovered or already completed record", async () => {
    const query: any = { update: vi.fn(() => query), eq: vi.fn(() => query) };
    query.then = (resolve: any) =>
      Promise.resolve({ error: null }).then(resolve);
    const runner = new TestOrchestrator({ dryRun: true, logToConsole: false });
    runner.setClient({ from: vi.fn(() => query) });
    await runner.complete();
    expect(query.eq).toHaveBeenCalledWith("id", "run-id");
    expect(query.eq).toHaveBeenCalledWith("status", "running");
    query.eq.mockClear();
    await runner.fail();
    expect(query.eq).toHaveBeenCalledWith("status", "running");
  });
});
