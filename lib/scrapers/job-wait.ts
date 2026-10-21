export type CapacityWait = {
  reason: "daily_capacity";
  observedAt: string;
  nextCheckAt: string;
};

export function dailyCapacityWait(now = Date.now()): CapacityWait {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return {
    reason: "daily_capacity",
    observedAt: new Date(now).toISOString(),
    nextCheckAt: next.toISOString(),
  };
}

/** A dated observation, not a worker heartbeat or a guaranteed completion time. */
export function publicCapacityWait(
  status: string,
  result: Record<string, unknown> | null | undefined,
  now = Date.now(),
): CapacityWait | null {
  const value = result?.waiting;
  if (status !== "pending" || !value || typeof value !== "object") return null;
  const wait = value as CapacityWait;
  if (wait.reason !== "daily_capacity" || typeof wait.observedAt !== "string")
    return null;
  const observed = Date.parse(wait.observedAt);
  if (!Number.isFinite(observed) || observed > now) return null;
  const expected = dailyCapacityWait(observed);
  if (
    wait.nextCheckAt !== expected.nextCheckAt ||
    Date.parse(expected.nextCheckAt) <= now
  )
    return null;
  return expected;
}
