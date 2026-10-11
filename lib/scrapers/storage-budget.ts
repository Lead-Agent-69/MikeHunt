import type { SupabaseClient } from "@supabase/supabase-js";

export type StorageBudget = {
  bytes: number | null;
  state: "normal" | "warning" | "critical" | "unknown";
  allowInsert: boolean;
};

/** Size-based insertion guard, separate from daily write counts. Errors fail closed. */
export function createStorageBudgetChecker(now = () => Date.now()) {
  let cached: StorageBudget | undefined;
  let nextCheck = 0;
  return async (
    client: Pick<SupabaseClient, "rpc">,
  ): Promise<StorageBudget> => {
    if (cached && now() < nextCheck) return cached;
    try {
      const { data, error } = await client.rpc("inventory_storage_bytes");
      const bytes =
        typeof data === "number" || typeof data === "string"
          ? Number(data)
          : NaN;
      if (error || !Number.isFinite(bytes) || bytes <= 0)
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
    }
    return cached;
  };
}
