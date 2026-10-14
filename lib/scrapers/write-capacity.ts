export type WriteQuota = {
  inserts: number;
  updates: number;
  touches?: number;
  maxInserts: number;
  maxUpdates: number;
  maxTouches: number;
};

/** Independent budgets: exhausting new-row capacity must not stop verified refreshes. */
export function writeCapacity(quota: WriteQuota) {
  const remaining = (limit: number, used: number, reserve: boolean) => {
    if (
      !Number.isFinite(limit) ||
      !Number.isFinite(used) ||
      limit <= 0 ||
      used < 0
    )
      return 0;
    const threshold = reserve
      ? Math.max(1, Math.floor(limit * 0.8))
      : Math.floor(limit);
    return Math.max(0, threshold - Math.ceil(used));
  };
  const insertsRemaining = remaining(quota.maxInserts, quota.inserts, true);
  const updatesRemaining = remaining(quota.maxUpdates, quota.updates, true);
  const touchesRemaining = remaining(
    quota.maxTouches,
    quota.touches ?? 0,
    false,
  );
  const mode =
    insertsRemaining > 0
      ? "full"
      : updatesRemaining > 0
        ? "refresh_only"
        : touchesRemaining > 0
          ? "observations_only"
          : "paused";
  return {
    insertsRemaining,
    updatesRemaining,
    touchesRemaining,
    mode,
    paused: insertsRemaining + updatesRemaining + touchesRemaining === 0,
  };
}
