import { describe, expect, it } from "vitest";
import { createLatestRequest } from "./latest-request";

describe("latest request ownership", () => {
  it("aborts old requests and invalidates responses from the same search repeated", () => {
    const requests = createLatestRequest();
    const older = requests.start();
    const newer = requests.start();
    expect(older.signal.aborted).toBe(true);
    expect(older.isCurrent()).toBe(false);
    expect(newer.isCurrent()).toBe(true);
  });

  it("does not let old cleanup clear a newer request's loading ownership", () => {
    const requests = createLatestRequest();
    const older = requests.start();
    const newer = requests.start();
    older.finish();
    expect(newer.isCurrent()).toBe(true);
    newer.finish();
    expect(newer.isCurrent()).toBe(false);
  });

  it("cancels on scope change/unmount without cancelling a future request", () => {
    const requests = createLatestRequest();
    const older = requests.start();
    requests.cancel();
    requests.cancel();
    expect(older.signal.aborted).toBe(true);
    expect(older.isCurrent()).toBe(false);
    expect(requests.start().isCurrent()).toBe(true);
  });

  it("ignores a late success, failure, and finally from an abort-ignoring fetch", async () => {
    const requests = createLatestRequest();
    let resolve!: () => void;
    const older = requests.start();
    const task = new Promise<void>((done) => {
      resolve = done;
    });
    const changes: string[] = [];
    const callback = async () => {
      try {
        await task;
        if (!older.isCurrent()) return;
        changes.push("old rows");
        throw new Error("old error");
      } catch {
        if (older.isCurrent()) changes.push("old error");
      } finally {
        if (older.isCurrent()) changes.push("old loading cleared");
        older.finish();
      }
    };
    const finished = callback();
    const newer = requests.start();
    resolve();
    await finished;
    expect(changes).toEqual([]);
    expect(newer.isCurrent()).toBe(true);
  });
});
