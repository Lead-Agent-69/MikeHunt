// lib/rate-limit.ts
// Lightweight, dependency-free fixed-window rate limiter for public API routes. Keyed by client IP.
// Note: serverless instances each hold their own counters, so this is a per-instance guard against
// a single hot instance being hammered — not a globally-consistent quota. For strict global limits
// use @upstash/ratelimit with Redis; this is the zero-dependency baseline.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = 0;

// Best-effort client IP from standard proxy headers.
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Returns { allowed, remaining, retryAfter }. Call at the top of a route handler.
 *   const rl = rateLimit(req, { limit: 60, windowMs: 60_000 })
 *   if (!rl.allowed) return tooMany(rl)
 */
export function rateLimit(
  req: Request,
  {
    limit = 60,
    windowMs = 60_000,
    key,
  }: { limit?: number; windowMs?: number; key?: string } = {},
): { allowed: boolean; remaining: number; retryAfter: number; limit: number } {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow unbounded. (forEach avoids downlevel-iteration.)
  if (now - lastSweep > windowMs) {
    buckets.forEach((b, k) => {
      if (b.resetAt <= now) buckets.delete(k);
    });
    lastSweep = now;
  }

  const id = `${key || "default"}:${clientIp(req)}`;
  let b = buckets.get(id);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(id, b);
  }
  b.count++;

  const remaining = Math.max(0, limit - b.count);
  const allowed = b.count <= limit;
  const retryAfter = allowed ? 0 : Math.ceil((b.resetAt - now) / 1000);
  return { allowed, remaining, retryAfter, limit };
}

/** Standard 429 response with Retry-After. */
export function tooManyRequests(rl: {
  retryAfter: number;
  limit: number;
}): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please slow down." }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(rl.retryAfter),
        "X-RateLimit-Limit": String(rl.limit),
      },
    },
  );
}
