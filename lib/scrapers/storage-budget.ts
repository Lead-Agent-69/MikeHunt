import type { SupabaseClient } from "@supabase/supabase-js";

export type StorageBudget = {
  bytes: number | null;
  state: "normal" | "warning" | "critical" | "unknown";
  allowInsert: boolean;
  effectiveDailyInsertLimit?: number;
  effectiveInsertsRemaining?: number;
};

/** Grow quickly with headroom, then slow down before the hard free-tier stop. */
export function storageInsertAllowance(
  budget: StorageBudget,
  quota: { inserts: number; maxInserts: number },
  warningMaxInserts = 500,
) {
  const configured = Math.max(0, Math.floor(quota.maxInserts));
  const dailyLimit =
    budget.state === "normal" && budget.allowInsert
      ? configured
      : budget.state === "warning" && budget.allowInsert
        ? Math.min(configured, Math.max(0, Math.floor(warningMaxInserts)))
        : 0;
  const threshold =
    dailyLimit > 0 ? Math.max(1, Math.floor(dailyLimit * 0.8)) : 0;
  const remaining = Math.max(0, threshold - Math.max(0, quota.inserts));
  return {
    dailyLimit,
    remaining,
    allowed: remaining > 0,
  };
}

/** Size-based insertion guard, separate from daily write counts. Errors fail closed. */
export function createStorageBudgetChecker(now = () => Date.now()) {
  let cached: StorageBudget | undefined;
  let nextCheck = 0;
  return async (
    client: Pick<SupabaseClient, "rpc">,
  ): Promise<StorageBudget> => {
    if (cached && now() < nextCheck) return cached;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // The explicit race releases the serialized writer even if a transport ignores abort.
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Database size measurement timed out"));
        }, 5000);
      });
      const { data, error } = await Promise.race([
        client.rpc("inventory_storage_bytes").abortSignal(controller.signal),
        deadline,
      ]);
      const bytes =
        typeof data === "number" || typeof data === "string"
          ? Number(data)
          : NaN;
      if (error || !Number.isSafeInteger(bytes) || bytes <= 0)
        throw new Error("Unverified database size");
      cached = {
        bytes,
        state:
          bytes >= 450_000_000
            ? "critical"
            : bytes >= 350_000_000
              ? "warning"
              : "normal",
        allowInsert: bytes < 450_000_000,
      };
      nextCheck = now() + 5 * 60_000;
    } catch {
      cached = { bytes: null, state: "unknown", allowInsert: false };
      nextCheck = now() + 60_000;
    } finally {
      clearTimeout(timer);
    }
    return cached;
  };
}
