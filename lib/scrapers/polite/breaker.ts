/**
 * Per-domain ban-risk circuit breaker. After `threshold` 403/429 responses inside `windowMs`, the
 * domain is paused for `pauseMs` (hours, not minutes). While paused we send it nothing. A success
 * resets the strike count. We never try a different route around the block: we wait.
 */
export interface DomainBreakerOptions {
  threshold?: number;
  windowMs?: number;
  pauseMs?: number;
}

export interface BreakerState {
  strikes: number[];
  pausedUntil: number;
  reason?: string;
}

export class DomainBreaker {
  readonly threshold: number;
  readonly windowMs: number;
  readonly pauseMs: number;
  private states = new Map<string, BreakerState>();

  constructor(opts: DomainBreakerOptions = {}) {
    this.threshold = opts.threshold ?? 3;
    this.windowMs = opts.windowMs ?? 60 * 60_000;
    this.pauseMs =
      opts.pauseMs ??
      Number(process.env.POLITE_BREAKER_PAUSE_HOURS || 6) * 60 * 60_000;
  }

  private state(domain: string): BreakerState {
    let s = this.states.get(domain);
    if (!s) {
      s = { strikes: [], pausedUntil: 0 };
      this.states.set(domain, s);
    }
    return s;
  }

  isOpen(domain: string, now: number = Date.now()): boolean {
    return this.state(domain).pausedUntil > now;
  }

  pausedUntil(domain: string): number {
    return this.state(domain).pausedUntil;
  }

  /** Record a 403/429. Returns true when this strike opened the breaker. */
  recordBanSignal(
    domain: string,
    status: number,
    now: number = Date.now(),
  ): boolean {
    const s = this.state(domain);
    s.strikes = s.strikes.filter((t) => now - t < this.windowMs);
    s.strikes.push(now);
    if (s.strikes.length >= this.threshold && s.pausedUntil <= now) {
      s.pausedUntil = now + this.pauseMs;
      s.reason = `HTTP ${status} x${s.strikes.length} within ${Math.round(this.windowMs / 60_000)}m`;
      s.strikes = [];
      return true;
    }
    return false;
  }

  /** Pause immediately (e.g. a bot challenge page: we will not try to pass it). */
  pause(domain: string, reason: string, now: number = Date.now()) {
    const s = this.state(domain);
    s.pausedUntil = Math.max(s.pausedUntil, now + this.pauseMs);
    s.reason = reason;
    s.strikes = [];
  }

  recordSuccess(domain: string) {
    const s = this.states.get(domain);
    if (s) s.strikes = [];
  }

  snapshot(now: number = Date.now()) {
    return Array.from(this.states.entries())
      .filter(([, s]) => s.pausedUntil > now)
      .map(([domain, s]) => ({
        domain,
        pausedUntil: new Date(s.pausedUntil).toISOString(),
        reason: s.reason || "",
      }));
  }

  reset() {
    this.states.clear();
  }
}
