import type { ScraperArgs } from "./tools/registry";

/** One signal covers page requests, enrichment and intake boundaries. */
export function sourceExecutionSignal(
  execution?: Pick<ScraperArgs, "abortSignal" | "deadlineAt">,
): AbortSignal | undefined {
  const signals: AbortSignal[] = execution?.abortSignal
    ? [execution.abortSignal]
    : [];
  if (Number.isFinite(execution?.deadlineAt)) {
    const remaining = Math.max(
      0,
      Math.min(2_147_483_647, Math.floor(execution!.deadlineAt! - Date.now())),
    );
    signals.push(
      remaining === 0
        ? AbortSignal.abort(
            new DOMException("Source deadline exceeded", "TimeoutError"),
          )
        : AbortSignal.timeout(remaining),
    );
  }
  return signals.length > 1 ? AbortSignal.any(signals) : signals[0];
}
