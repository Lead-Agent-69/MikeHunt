/**
 * Per-domain request outcomes for ban-risk monitoring. banRisk = (403 + 429) / requests sent.
 * Snapshot is small and JSON-safe so the worker can attach it to scrape_jobs.result for /status.
 */
export interface DomainCounters {
  requests: number;
  ok: number;
  notModified: number;
  forbidden: number;
  tooMany: number;
  serverErrors: number;
  otherErrors: number;
  robotsDenied: number;
  breakerSkips: number;
  challenges: number;
}

const empty = (): DomainCounters => ({
  requests: 0,
  ok: 0,
  notModified: 0,
  forbidden: 0,
  tooMany: 0,
  serverErrors: 0,
  otherErrors: 0,
  robotsDenied: 0,
  breakerSkips: 0,
  challenges: 0,
});

export class PoliteMetrics {
  private byDomain = new Map<string, DomainCounters>();
  private since = Date.now();

  private c(domain: string) {
    let v = this.byDomain.get(domain);
    if (!v) {
      v = empty();
      this.byDomain.set(domain, v);
    }
    return v;
  }

  recordStatus(domain: string, status: number) {
    const c = this.c(domain);
    c.requests += 1;
    if (status === 304) c.notModified += 1;
    else if (status >= 200 && status < 400) c.ok += 1;
    else if (status === 403) c.forbidden += 1;
    else if (status === 429) c.tooMany += 1;
    else if (status >= 500) c.serverErrors += 1;
    else c.otherErrors += 1;
  }
  recordNetworkError(domain: string) {
    const c = this.c(domain);
    c.requests += 1;
    c.otherErrors += 1;
  }
  recordRobotsDenied(domain: string) {
    this.c(domain).robotsDenied += 1;
  }
  recordBreakerSkip(domain: string) {
    this.c(domain).breakerSkips += 1;
  }
  recordChallenge(domain: string) {
    this.c(domain).challenges += 1;
  }

  snapshot(
    paused: { domain: string; pausedUntil: string; reason: string }[] = [],
  ) {
    return summarizePoliteness(
      Array.from(this.byDomain.entries()).map(([domain, c]) => ({
        domain,
        ...c,
      })),
      paused,
      new Date(this.since).toISOString(),
    );
  }

  reset() {
    this.byDomain.clear();
    this.since = Date.now();
  }
}

export type DomainRow = DomainCounters & { domain: string };

export function banRisk(
  c: Pick<DomainCounters, "requests" | "forbidden" | "tooMany">,
) {
  return c.requests > 0 ? (c.forbidden + c.tooMany) / c.requests : 0;
}

export function summarizePoliteness(
  rows: DomainRow[],
  paused: { domain: string; pausedUntil: string; reason: string }[] = [],
  since?: string,
) {
  const totals = rows.reduce(
    (t, r) => {
      t.requests += r.requests;
      t.forbidden += r.forbidden;
      t.tooMany += r.tooMany;
      t.notModified += r.notModified;
      t.robotsDenied += r.robotsDenied;
      t.challenged += r.challenges ?? 0;
      return t;
    },
    {
      requests: 0,
      forbidden: 0,
      tooMany: 0,
      notModified: 0,
      robotsDenied: 0,
      challenged: 0,
    },
  );
  const domains = rows
    .map((r) => ({
      ...r,
      banRiskPct: Math.round(banRisk(r) * 1000) / 10,
    }))
    .sort((a, b) => b.banRiskPct - a.banRiskPct || b.requests - a.requests);
  return {
    since: since ?? null,
    requests: totals.requests,
    banRiskPct: Math.round(banRisk(totals) * 1000) / 10,
    rate403Pct: totals.requests
      ? Math.round((totals.forbidden / totals.requests) * 1000) / 10
      : 0,
    rate429Pct: totals.requests
      ? Math.round((totals.tooMany / totals.requests) * 1000) / 10
      : 0,
    cacheHitPct: totals.requests
      ? Math.round((totals.notModified / totals.requests) * 1000) / 10
      : 0,
    robotsDenied: totals.robotsDenied,
    /** Bot-challenge pages seen: a "challenged" outcome with a short backoff, retried next schedule. */
    challenged: totals.challenged,
    challengedDomains: rows
      .filter((r) => (r.challenges ?? 0) > 0)
      .map((r) => ({ domain: r.domain, challenges: r.challenges })),
    pausedDomains: paused,
    // Top 25 riskiest domains is plenty for /status and keeps the job result small.
    domains: domains.slice(0, 25),
  };
}

export type PolitenessSnapshot = ReturnType<typeof summarizePoliteness>;
