import { describe, expect, it } from "vitest";
import { sourceExecutionSignal } from "./source-execution";
describe("source execution boundaries", () => {
  it("keeps legacy direct calls usable without allocating a signal", () => {
    expect(sourceExecutionSignal()).toBeUndefined();
    expect(sourceExecutionSignal({ deadlineAt: NaN })).toBeUndefined();
  });
  it("propagates caller cancellation", () => {
    const controller = new AbortController();
    const signal = sourceExecutionSignal({
      abortSignal: controller.signal,
      deadlineAt: Date.now() + 1000,
    });
    controller.abort(new Error("buyer cancelled"));
    expect(() => signal?.throwIfAborted()).toThrow("buyer cancelled");
  });
  it("rejects already expired deadlines before any fetch or write", () => {
    expect(() =>
      sourceExecutionSignal({ deadlineAt: Date.now() - 1 })?.throwIfAborted(),
    ).toThrow("Source deadline exceeded");
  });
});
