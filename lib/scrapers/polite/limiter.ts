/**
 * Per-domain pacing: at most `maxConcurrent` (1 by default, never more than 2) requests in flight per
 * domain, and a randomized gap between request starts: max(robots Crawl-delay, minGapMs) plus a random
 * 0–100% jitter (POLITE_JITTER_RATIO). The first request to a domain is also staggered by a random
 * 0–50% of the gap, so parallel domains never fire in lockstep.
 */
import { registryDomainOverride, type DomainOverride } from "./source-limits";

export interface DomainLimiterOptions {
  maxConcurrent?: number;
  minGapMs?: number;
  jitterRatio?: number;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /**
   * Per-domain minimum gap from the source registry (rateLimit). Defaults to registryGapFloorMs;
   * pass `() => 0` to opt out (tests).
   */
  domainFloorMs?: (domain: string) => number;
  /** Full per-domain override (registry SourceConfig.polite + rateLimit). Default: the registry. */
  domainOverride?: (domain: string) => DomainOverride;
}

interface DomainSlot {
  active: number;
  waiters: (() => void)[];
  nextStartAt: number;
  crawlDelayMs: number;
}

export const MAX_DOMAIN_CONCURRENCY = 2;

export class DomainLimiter {
  readonly maxConcurrent: number;
  readonly minGapMs: number;
  private readonly jitterRatio: number;
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly override: (domain: string) => DomainOverride;
  private slots = new Map<string, DomainSlot>();

  constructor(opts: DomainLimiterOptions = {}) {
    const requested =
      opts.maxConcurrent ?? Number(process.env.POLITE_DOMAIN_CONCURRENCY || 1);
    this.maxConcurrent = Math.min(
      MAX_DOMAIN_CONCURRENCY,
      Math.max(1, Math.floor(requested) || 1),
    );
    this.minGapMs =
      opts.minGapMs ?? Number(process.env.POLITE_MIN_GAP_MS || 3_000);
    const envJitter = Number(process.env.POLITE_JITTER_RATIO);
    this.jitterRatio =
      opts.jitterRatio ??
      (Number.isFinite(envJitter) && envJitter >= 0 ? Math.min(envJitter, 3) : 1);
    this.random = opts.random ?? Math.random;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = opts.now ?? Date.now;
    const floor = opts.domainFloorMs;
    this.override =
      opts.domainOverride ??
      (floor ? (d: string) => ({ floorMs: floor(d) }) : registryDomainOverride);
  }

  /**
   * max(min gap, robots Crawl-delay, registry rateLimit gap) before jitter. The min gap is the
   * source's polite.minGapMs when the registry sets one, else POLITE_MIN_GAP_MS.
   */
  baseGapMs(domain: string): number {
    const o = this.override(domain);
    return Math.max(
      o.minGapMs ?? this.minGapMs,
      this.slot(domain).crawlDelayMs,
      o.floorMs || 0,
    );
  }

  /** In-flight cap for a domain: the registry override (1-2) or the worker default. */
  maxConcurrentFor(domain: string): number {
    const o = this.override(domain).maxConcurrent;
    return o ? Math.min(MAX_DOMAIN_CONCURRENCY, Math.max(1, o)) : this.maxConcurrent;
  }

  private slot(domain: string): DomainSlot {
    let s = this.slots.get(domain);
    if (!s) {
      s = { active: 0, waiters: [], nextStartAt: -1, crawlDelayMs: 0 };
      this.slots.set(domain, s);
    }
    return s;
  }

  /** Apply a robots.txt Crawl-delay (seconds). Capped at 60s so one host can't stall a sweep forever. */
  setCrawlDelay(domain: string, seconds: number | null) {
    if (seconds == null) return;
    this.slot(domain).crawlDelayMs = Math.min(
      60_000,
      Math.max(0, seconds * 1000),
    );
  }

  /** Push the next start for a domain out (e.g. after Retry-After). */
  deferUntil(domain: string, at: number) {
    const s = this.slot(domain);
    s.nextStartAt = Math.max(s.nextStartAt, at);
  }

  gapMs(domain: string): number {
    const base = this.baseGapMs(domain);
    const jitter = this.override(domain).jitterRatio ?? this.jitterRatio;
    return Math.round(base + base * jitter * this.random());
  }

  async run<T>(domain: string, task: () => Promise<T>): Promise<T> {
    const s = this.slot(domain);
    // Slots are handed straight to the next waiter on release, so a late caller can never jump
    // the queue and push a domain past maxConcurrent.
    if (s.active >= this.maxConcurrentFor(domain)) {
      await new Promise<void>((resolve) => s.waiters.push(resolve));
    } else {
      s.active += 1;
    }
    try {
      if (s.nextStartAt < 0) {
        // First touch of this domain: a small random stagger, then normal pacing.
        const base = this.baseGapMs(domain);
        s.nextStartAt = this.now() + Math.round(base * 0.5 * this.random());
      }
      const wait = s.nextStartAt - this.now();
      // Reserve the next start before sleeping so concurrent callers queue behind us.
      s.nextStartAt = Math.max(this.now(), s.nextStartAt) + this.gapMs(domain);
      if (wait > 0) await this.sleep(wait);
      return await task();
    } finally {
      const next = s.waiters.shift();
      if (next) next();
      else s.active -= 1;
    }
  }
}
