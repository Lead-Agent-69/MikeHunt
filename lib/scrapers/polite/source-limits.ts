/**
 * Per-source pacing from the registry, applied per domain in DomainLimiter / DomainBreaker:
 *  - SourceConfig.rateLimit (e.g. Copart/IAA 2 per 60s) is a minimum gap (Ren #269).
 *  - SourceConfig.polite.* overrides the worker-wide POLITE_* defaults for that source's hosts.
 * Several sources on one host: the slowest (largest gap / longest pause / lowest concurrency) wins.
 * A robots.txt Crawl-delay is applied on top by the limiter and is always the floor.
 */
import { ALL_SOURCES, type SourceConfig } from "../sources-registry";

function bareHost(value: string): string {
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** perMs / requests, or 0 when the limit is missing or nonsensical. Capped at 10 minutes. */
export function rateLimitGapMs(limit: SourceConfig["rateLimit"]): number {
  if (!limit) return 0;
  const req = Number(limit.requests);
  const per = Number(limit.perMs);
  if (!Number.isFinite(req) || !Number.isFinite(per) || req <= 0 || per <= 0)
    return 0;
  return Math.min(10 * 60_000, Math.round(per / req));
}

export interface DomainOverride {
  /** Registry rateLimit gap: a floor under every other gap setting. */
  floorMs?: number;
  /** polite.minGapMs: replaces POLITE_MIN_GAP_MS for this host. */
  minGapMs?: number;
  jitterRatio?: number;
  maxConcurrent?: number;
  breakerPauseMs?: number;
  challengeBackoffMs?: number;
}

const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined;

function merge(a: DomainOverride, b: DomainOverride): DomainOverride {
  const max = (x?: number, y?: number) =>
    x === undefined ? y : y === undefined ? x : Math.max(x, y);
  const min = (x?: number, y?: number) =>
    x === undefined ? y : y === undefined ? x : Math.min(x, y);
  return {
    floorMs: max(a.floorMs, b.floorMs),
    minGapMs: max(a.minGapMs, b.minGapMs),
    jitterRatio: max(a.jitterRatio, b.jitterRatio),
    maxConcurrent: min(a.maxConcurrent, b.maxConcurrent),
    breakerPauseMs: max(a.breakerPauseMs, b.breakerPauseMs),
    challengeBackoffMs: max(a.challengeBackoffMs, b.challengeBackoffMs),
  };
}

export function overrideFromSource(s: SourceConfig): DomainOverride | null {
  const p = s.polite ?? {};
  const o: DomainOverride = {};
  const gap = rateLimitGapMs(s.rateLimit);
  if (gap) o.floorMs = gap;
  if (num(p.minGapMs) !== undefined)
    o.minGapMs = Math.min(10 * 60_000, p.minGapMs!);
  if (num(p.jitterRatio) !== undefined)
    o.jitterRatio = Math.min(3, p.jitterRatio!);
  if (num(p.maxConcurrent) !== undefined)
    o.maxConcurrent = Math.min(2, Math.max(1, Math.floor(p.maxConcurrent!)));
  if (num(p.breakerPauseHours) !== undefined)
    o.breakerPauseMs = Math.min(72, p.breakerPauseHours!) * 3_600_000;
  if (num(p.challengeBackoffMin) !== undefined)
    o.challengeBackoffMs = Math.min(24 * 60, p.challengeBackoffMin!) * 60_000;
  return Object.keys(o).length ? o : null;
}

export function buildDomainOverrides(
  sources: readonly SourceConfig[],
): Map<string, DomainOverride> {
  const out = new Map<string, DomainOverride>();
  for (const s of sources) {
    const o = overrideFromSource(s);
    if (!o) continue;
    for (const h of [s.url, ...(s.exemptHosts ?? [])]) {
      const host = bareHost(h);
      if (host) out.set(host, out.has(host) ? merge(out.get(host)!, o) : o);
    }
  }
  return out;
}

/** Back-compat: host → rateLimit gap only. */
export function buildDomainGapFloors(
  sources: readonly SourceConfig[],
): Map<string, number> {
  const floors = new Map<string, number>();
  for (const [host, o] of Array.from(buildDomainOverrides(sources).entries()))
    if (o.floorMs) floors.set(host, o.floorMs);
  return floors;
}

let registryOverrides: Map<string, DomainOverride> | null = null;

/** Registry override for a domain (or a parent domain); {} when none. */
export function registryDomainOverride(domain: string): DomainOverride {
  if (!registryOverrides) registryOverrides = buildDomainOverrides(ALL_SOURCES);
  const d = domain.toLowerCase().replace(/^www\./, "");
  let out: DomainOverride = {};
  for (const [host, o] of Array.from(registryOverrides.entries())) {
    if (d === host || d.endsWith(`.${host}`)) out = merge(out, o);
  }
  return out;
}

/** Registry-derived minimum gap for a domain (rateLimit), 0 when none is configured. */
export function registryGapFloorMs(domain: string): number {
  return registryDomainOverride(domain).floorMs ?? 0;
}

/** Tests only. */
export function setRegistryOverridesForTest(
  sources: readonly SourceConfig[] | null,
) {
  registryOverrides = sources ? buildDomainOverrides(sources) : null;
}
