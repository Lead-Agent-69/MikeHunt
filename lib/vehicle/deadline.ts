// Upstream time budget for the public VIN routes. One request can chain up to ~13 upstream calls
// (vPIC decode, recalls catalog + up to 12 recall names, safety x2, EPA x2, mcp.vin fallback), so each
// call gets its own timeout AND the request has one overall deadline. Once the deadline passes, the
// remaining calls are skipped (callers treat that as "unknown", never as a fake zero).

/** Per-call timeout for any single upstream request. */
export const UPSTREAM_CALL_TIMEOUT_MS = 10_000;
/** Overall upstream budget for one /api/vin request. */
export const VIN_REQUEST_DEADLINE_MS = 15_000;

export interface Deadline {
  /** Aborts when the overall deadline passes. */
  readonly signal: AbortSignal;
  expired(): boolean;
  remainingMs(): number;
}

export function createDeadline(
  ms: number = VIN_REQUEST_DEADLINE_MS,
  now: () => number = Date.now,
): Deadline {
  const end = now() + ms;
  const signal = AbortSignal.timeout(Math.max(1, ms));
  return {
    signal,
    expired: () => signal.aborted || now() >= end,
    remainingMs: () => Math.max(0, end - now()),
  };
}

/**
 * Signal for one upstream call: aborts at the per-call timeout or the request deadline, whichever
 * comes first. Without a deadline, the per-call timeout still applies.
 */
export function callSignal(
  deadline?: Deadline,
  perCallMs: number = UPSTREAM_CALL_TIMEOUT_MS,
): AbortSignal {
  const per = AbortSignal.timeout(
    Math.max(
      1,
      Math.min(perCallMs, deadline ? deadline.remainingMs() || 1 : perCallMs),
    ),
  );
  return deadline ? AbortSignal.any([per, deadline.signal]) : per;
}

export interface UpstreamOpts {
  deadline?: Deadline;
}
