/**
 * Per-source request rates from the registry (SourceConfig.rateLimit, e.g. Copart/IAA 2 per 60s)
 * applied as a per-domain minimum gap in DomainLimiter (Ren #269). The gap is a floor: robots
 * Crawl-delay and POLITE_MIN_GAP_MS still apply when they are larger, and jitter is added on top.
 * Several sources on one host: the slowest (largest) gap wins.
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

export function buildDomainGapFloors(
  sources: readonly SourceConfig[],
): Map<string, number> {
  const floors = new Map<string, number>();
  for (const s of sources) {
    const gap = rateLimitGapMs(s.rateLimit);
    if (!gap) continue;
    for (const h of [s.url, ...(s.exemptHosts ?? [])]) {
      const host = bareHost(h);
      if (host) floors.set(host, Math.max(floors.get(host) ?? 0, gap));
    }
  }
  return floors;
}

let registryFloors: Map<string, number> | null = null;

/** Registry-derived minimum gap for a domain (or a parent domain), 0 when none is configured. */
export function registryGapFloorMs(domain: string): number {
  if (!registryFloors) registryFloors = buildDomainGapFloors(ALL_SOURCES);
  const d = domain.toLowerCase().replace(/^www\./, "");
  let best = 0;
  for (const [host, gap] of Array.from(registryFloors.entries())) {
    if (d === host || d.endsWith(`.${host}`)) best = Math.max(best, gap);
  }
  return best;
}
