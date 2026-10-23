import { applyBuyableInventory } from "@/lib/search/customer-inventory";

type InventoryRead = "active" | "fresh_photos" | "added_24h" | "newest";
type ReadFailure =
  | "deadline"
  | "transport"
  | "database"
  | "database_canceled"
  | "rate_limited"
  | "invalid_count";

export class InventoryStatusReadError extends Error {
  constructor(
    readonly read: InventoryRead,
    readonly reason: ReadFailure,
    readonly durationMs: number,
    readonly httpStatus: number | null,
  ) {
    super(
      reason === "invalid_count"
        ? "Inventory count not confirmed"
        : "Inventory status unavailable",
    );
    this.name = "InventoryStatusReadError";
  }
}

/** Allowlisted operator diagnostics only: no database messages, SQL, URLs, or response payloads. */
export function inventoryFailureDiagnostic(error: unknown) {
  if (!(error instanceof InventoryStatusReadError))
    return { reason: "unexpected" };
  return {
    read: error.read,
    reason: error.reason,
    durationMs: error.durationMs,
    httpStatus: error.httpStatus,
  };
}

/** Headline reads only. Never scan listing payloads or run valuation diagnostics for public traffic. */
export async function publicInventoryStatus(sb: any, now = Date.now()) {
  const signal = AbortSignal.timeout(4000);
  async function read(name: InventoryRead, query: any, count = true) {
    const started = performance.now();
    const failure = (reason: ReadFailure, status?: number) =>
      new InventoryStatusReadError(
        name,
        reason,
        Math.round(performance.now() - started),
        typeof status === "number" &&
          Number.isInteger(status) &&
          status >= 100 &&
          status <= 599
          ? status
          : null,
      );
    try {
      const result = await query.abortSignal(signal);
      if (result.error)
        throw failure(
          signal.aborted
            ? "deadline"
            : result.error.code === "57014"
              ? "database_canceled"
              : result.status === 429
                ? "rate_limited"
                : result.status === 0
                  ? "transport"
                  : "database",
          result.status,
        );
      if (count && (!Number.isSafeInteger(result.count) || result.count < 0))
        throw failure("invalid_count", result.status);
      return result;
    } catch (error) {
      if (error instanceof InventoryStatusReadError) throw error;
      throw failure(signal.aborted ? "deadline" : "transport");
    }
  }
  const countActive = () =>
    sb
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
  const [active, fresh, added, newest] = await Promise.all([
    read("active", countActive()),
    read("fresh_photos", applyBuyableInventory(countActive(), now)),
    read(
      "added_24h",
      countActive().gt("created_at", new Date(now - 86400000).toISOString()),
    ),
    read(
      "newest",
      sb
        .from("deals")
        .select("last_seen_at")
        .eq("active", true)
        .lte("last_seen_at", new Date(now).toISOString())
        .order("last_seen_at", { ascending: false })
        .limit(1),
      false,
    ),
  ]);
  const stamp = Date.parse(newest.data?.[0]?.last_seen_at || "");
  return {
    activeDeals: active.count,
    buyerReady: fresh.count > 0,
    // This lightweight check cannot certify valuation readiness or source coverage.
    decisionReady: false,
    freshPhotoListings: fresh.count,
    sourceHealth: { activeDeals: active.count, readySources: null },
    freshness: {
      activeDeals: active.count,
      newLast24h: added.count,
      newestAgeHours: Number.isFinite(stamp)
        ? Math.max(0, (now - stamp) / 3600000)
        : null,
      stale: fresh.count === 0,
    },
    quality: { goDeals: null, watchCandidates: null },
    coverage: "inventory_only",
    checkedAt: new Date(now).toISOString(),
  };
}
