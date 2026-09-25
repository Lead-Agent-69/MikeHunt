import { NextRequest } from "next/server";

/**
 * Verify a request is an authorized cron / automation trigger.
 *
 * Supports two mechanisms:
 *  1. Vercel Cron — automatically sends `Authorization: Bearer <CRON_SECRET>`
 *     when the `CRON_SECRET` env var is set (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
 *  2. Manual / external triggers (e.g. GitHub Actions workflow_dispatch) may send
 *     the same Bearer header or a `?secret=` query param for convenience.
 *
 * If `CRON_SECRET` is not configured the endpoint is treated as locked (returns false),
 * so scheduled jobs cannot be invoked anonymously in production.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${expected}`) return true;

  const querySecret = new URL(request.url).searchParams.get("secret");
  if (querySecret && querySecret === expected) return true;

  return false;
}
