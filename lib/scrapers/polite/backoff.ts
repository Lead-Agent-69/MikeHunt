/**
 * Retry timing. 429 and 503 are the site telling us to slow down: honor Retry-After when present,
 * else back off exponentially with jitter. Everything is capped so one host can't stall a sweep.
 */

/** Parse a Retry-After header (delta-seconds or HTTP-date) into milliseconds from `now`. */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, at - now);
}

/** Exponential backoff: base * 2^(attempt-1), plus up to 50% jitter, capped. attempt starts at 1. */
export function backoffMs(
  attempt: number,
  opts: { baseMs?: number; capMs?: number; random?: () => number } = {},
): number {
  const base = opts.baseMs ?? 5_000;
  const cap = opts.capMs ?? 5 * 60_000;
  const random = opts.random ?? Math.random;
  const exp = base * 2 ** Math.max(0, attempt - 1);
  const withJitter = exp + exp * 0.5 * random();
  return Math.min(cap, Math.round(withJitter));
}

/** Statuses that mean "slow down and try later" (retryable with backoff). */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status === 503;
}

/** Statuses that count toward the ban-risk breaker. */
export function isBanSignal(status: number): boolean {
  return status === 403 || status === 429;
}
