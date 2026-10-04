import { NextRequest } from "next/server";

/**
 * Verify a request is an authorized cron / automation trigger.
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when that env var is set.
 * Manual triggers (GitHub Actions) must send the same header.
 *
 * Query `?secret=` is rejected. Secrets in URLs land in access logs, Referer, and browser history.
 * If `CRON_SECRET` is unset the endpoint stays locked.
 */
export function isAuthorizedCron(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${expected}`;
}
