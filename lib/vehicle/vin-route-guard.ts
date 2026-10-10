// Limits for the public VIN routes (/api/vin/[vin] and /api/vin/[vin]/specs), on top of each route's
// per-IP 30/min:
//   - a global request cap shared by both routes, so many IPs together can't fan out upstream;
//   - a per-user cap keyed by the signed-in user id (rotating IPs doesn't help);
//   - a global budget for NEW vin_decodes rows, so fabricated VINs can't flood the table. Over budget,
//     the live decode is still returned, just not cached.
// Like lib/rate-limit, counters are per serverless instance (a guard, not a global quota).

import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createDeadline, type Deadline } from "./deadline";

export const VIN_GLOBAL_LIMIT_PER_MIN = 300;
export const VIN_USER_LIMIT_PER_MIN = 60;
export const VIN_DECODE_WRITES_PER_HOUR = 200;

export interface VinGuard {
  /** 429 response when a limit is hit, else null. */
  blocked: Response | null;
  deadline: Deadline;
  /** Spends one unit of the global new-row budget; false when it's used up. */
  canWrite: () => boolean;
}

async function defaultUserId(): Promise<string | null> {
  try {
    const mod = await import("@/lib/server-supabase");
    if (!(await mod.hasAuthSessionCookie())) return null;
    const { data } = await mod.getServerUser();
    return data?.user?.id ?? null;
  } catch {
    return null; // no request scope / auth unavailable: treat as a guest (IP limit still applies)
  }
}

export async function guardVinRoute(
  req: Request,
  opts: { getUserId?: () => Promise<string | null> } = {},
): Promise<VinGuard> {
  const deadline = createDeadline();
  const canWrite = () =>
    rateLimit(req, {
      key: "vin-decode-write",
      identity: "global",
      limit: VIN_DECODE_WRITES_PER_HOUR,
      windowMs: 3_600_000,
    }).allowed;

  const global = rateLimit(req, {
    key: "vin-global",
    identity: "global",
    limit: VIN_GLOBAL_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!global.allowed)
    return { blocked: tooManyRequests(global), deadline, canWrite };

  const userId = await (opts.getUserId ?? defaultUserId)();
  if (userId) {
    const user = rateLimit(req, {
      key: "vin-user",
      identity: `user:${userId}`,
      limit: VIN_USER_LIMIT_PER_MIN,
      windowMs: 60_000,
    });
    if (!user.allowed)
      return { blocked: tooManyRequests(user), deadline, canWrite };
  }
  return { blocked: null, deadline, canWrite };
}
