// lib/auth/scrape-gate.ts
//
// Single implementation of the scraper-control auth gate.
//
// `app/api/scrape/route.ts` already had a correct fail-closed shared-secret check, but it was
// written inline — so its four sibling routes never got one. As committed they had ZERO auth:
//
//   * /api/scrape/credentials  GET/POST/DELETE — anyone could read, overwrite or delete the
//                              encrypted credentials for auth-required sources (Copart/IAA/…).
//   * /api/scrape/queue        — plus an attacker-supplied `redisUrl`, i.e. unauthenticated SSRF:
//                              point Bull at a Redis you own and exfiltrate/forge jobs.
//   * /api/scrape/execute      — start unbounded browser scrapes, burning IP/CPU/quota.
//   * /api/scrape/registry     — enable/disable sources and reset failure counters.
//
// Everything here is fail-closed. With no secret configured, production returns 503 rather than
// silently opening; local dev stays usable so a dev box doesn't need secrets to run.

import { NextRequest, NextResponse } from "next/server";

/** The shared secret, or null when neither is configured. */
export function scrapeSecret(): string | null {
  const secret = process.env.SCRAPE_SECRET || process.env.CRON_SECRET;
  return secret && secret.length > 0 ? secret : null;
}

/** True when the request presents `Authorization: Bearer <secret>`. Fails closed if unset. */
export function hasScrapeSecret(request: NextRequest): boolean {
  const secret = scrapeSecret();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export interface ScrapeGateOptions {
  /**
   * Also accept a signed-in ADMIN session (not just the bearer secret).
   *
   * Only routes the browser calls should set this — `/orchestrator` fetches `/api/scrape/health`
   * through SWR with no Authorization header. The pure ops routes (credentials/registry/execute/
   * queue) have no UI, so they stay bearer-only: strictly stronger, nothing to thread through.
   */
  allowAdminSession?: boolean;
  /** Accept any signed-in user. Use only for bounded, buyer-scoped queue submission. */
  allowAuthenticatedSession?: boolean;
  /**
   * Allows the browser UI to trigger scraper runs in the local Supabase stack without exposing
   * SCRAPE_SECRET to client JavaScript. This is intentionally narrower than "dev mode": both the
   * configured Supabase URL and the request host must be localhost/127.0.0.1.
   */
  allowLocalhostUi?: boolean;
}

function isLocalhostUiRequest(request: NextRequest): boolean {
  const supabaseUrl = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  ).toLowerCase();
  const localSupabase =
    supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost");
  if (!localSupabase) return false;
  const host = request.headers.get("host")?.toLowerCase() || "";
  const origin = request.headers.get("origin")?.toLowerCase() || "";
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.toLowerCase() || "";
  return [host, origin, forwardedHost].some(
    (value) =>
      value.includes("localhost") ||
      value.includes("127.0.0.1") ||
      value.includes("[::1]"),
  );
}

/**
 * Returns a NextResponse to short-circuit with, or null when the request is allowed.
 * Call as: `const denied = await denyUnauthed(req); if (denied) return denied;`
 */
export async function denyUnauthed(
  request: NextRequest,
  options: ScrapeGateOptions = {},
): Promise<NextResponse | null> {
  if (hasScrapeSecret(request)) return null;
  if (options.allowLocalhostUi && isLocalhostUiRequest(request)) return null;

  const secret = scrapeSecret();
  if (!secret) {
    // No secret configured. Open only outside production so local dev keeps working.
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        {
          error:
            "Endpoint disabled: set SCRAPE_SECRET or CRON_SECRET to enable scraper control APIs.",
        },
        { status: 503 },
      );
    }
    return null;
  }

  if (options.allowAdminSession && (await isAdminSession(request))) return null;
  if (options.allowAuthenticatedSession && (await hasUserSession()))
    return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function hasUserSession(): Promise<boolean> {
  try {
    const { getServerUser } = await import("@/lib/server-supabase");
    const {
      data: { user },
    } = await getServerUser();
    return Boolean(user?.id);
  } catch {
    return false;
  }
}

/**
 * Admin session check for browser-called routes. Reads the Supabase session cookie and checks it
 * against the single-admin email (lib/auth/admin.ts). Any error means "not admin".
 */
async function isAdminSession(_request: NextRequest): Promise<boolean> {
  try {
    const { getServerUser } = await import("@/lib/server-supabase");
    const { isAdminEmail } = await import("@/lib/auth/admin");
    const {
      data: { user },
    } = await getServerUser();
    return isAdminEmail(user?.email ?? null);
  } catch {
    return false;
  }
}

/**
 * Whether the caller may see INTERNAL scraper detail (scraper_runs.error_message, which can carry
 * file paths, upstream URLs and stack traces).
 *
 * Used by /api/scrape/health, which deliberately stays reachable WITHOUT auth: both
 * scripts/freshness-monitor.mjs and the /orchestrator SWR fetch call it with no Authorization
 * header and need `sources[].{id,enabled,lastRunAt,lastStatus}` to do their jobs. So the endpoint
 * is never blocked — only the sensitive field is withheld from anonymous callers.
 */
export async function canSeeScrapeDetail(
  request: NextRequest,
): Promise<boolean> {
  if (hasScrapeSecret(request)) return true;
  if (!scrapeSecret() && process.env.NODE_ENV !== "production") return true;
  return isAdminSession(request);
}
