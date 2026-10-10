// Limits for the public VIN routes (/api/vin/[vin] and /api/vin/[vin]/specs), on top of each route's
// per-IP 30/min. ALL of these are PER SERVERLESS INSTANCE (in-memory, like lib/rate-limit), not global
// quotas: N warm instances allow up to N times each number. They bound one instance's fan-out.
//   - a per-instance request cap shared by both routes;
//   - a per-user cap keyed by the signed-in user id (rotating IPs doesn't help), per instance;
//   - a per-instance budget for NEW cache rows (vin_decodes and nhtsa_recalls_cache together), so
//     fabricated VINs can't flood either table. Over budget the live answer is returned, just not cached.

import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { createDeadline, type Deadline } from "./deadline";

export const VIN_INSTANCE_LIMIT_PER_MIN = 300;
export const VIN_USER_LIMIT_PER_MIN = 60;
/** New cache rows (vin_decodes + nhtsa_recalls_cache) per hour, per instance. */
export const VIN_DECODE_WRITES_PER_HOUR = 200;

export interface VinGuard {
  /** 429 response when a limit is hit, else null. */
  blocked: Response | null;
  deadline: Deadline;
  /** Spends one unit of this instance's new-row budget; false when it's used up. */
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
      identity: "instance",
      limit: VIN_DECODE_WRITES_PER_HOUR,
      windowMs: 3_600_000,
    }).allowed;

  const inst = rateLimit(req, {
    key: "vin-instance",
    identity: "instance",
    limit: VIN_INSTANCE_LIMIT_PER_MIN,
    windowMs: 60_000,
  });
  if (!inst.allowed)
    return { blocked: tooManyRequests(inst), deadline, canWrite };

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
