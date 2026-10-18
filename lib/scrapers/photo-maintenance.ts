import type { SupabaseClient } from "@supabase/supabase-js";
import { inspectListingPhotos } from "../images/photo-health";

export type PhotoMaintenanceReceipt = {
  state: string;
  checked: number;
  available: number;
  unavailable: number;
  unknown: number;
  placeholder: number;
  written: number;
  conflicts: number;
  failed: number;
};

/** Bounded photo maintenance, never an inventory refresh or a title/price assertion. */
export async function maintainListingPhotos(
  client: SupabaseClient,
  options: {
    state: string;
    limit: number;
    signal: AbortSignal;
    beforeWrite: () => Promise<boolean>;
    onWrite: (row: { source: string; source_deal_id: string }) => Promise<void>;
  },
): Promise<PhotoMaintenanceReceipt> {
  if (
    !/^[A-Z]{2}$/.test(options.state) ||
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    options.limit > 10
  )
    throw new Error("Invalid photo maintenance scope");
  const receipt: PhotoMaintenanceReceipt = {
    state: options.state,
    checked: 0,
    available: 0,
    unavailable: 0,
    unknown: 0,
    placeholder: 0,
    written: 0,
    conflicts: 0,
    failed: 0,
  };
  const { data, error } = await client
    .from("deals")
    .select("id,source,source_deal_id,images,options,updated_at")
    .eq("active", true)
    .eq("location_state", options.state)
    .gte("last_seen_at", new Date(Date.now() - 72 * 3600_000).toISOString())
    .not("images", "is", null)
    .neq("images", "{}")
    .order("options->photoCheckAttempt->>checkedAt", {
      ascending: true,
      nullsFirst: true,
    })
    .order("id", { ascending: true })
    .limit(options.limit)
    .abortSignal(options.signal);
  if (error) throw new Error("Photo maintenance candidates could not be read");
  for (const row of data || []) {
    try {
      options.signal.throwIfAborted();
      const result = await inspectListingPhotos(row.images, {
        signal: options.signal,
      });
      receipt.checked++;
      receipt[result.state]++;
      if (!(await options.beforeWrite())) break;
      options.signal.throwIfAborted();
      const patch = {
        updated_at: new Date().toISOString(),
        options: {
          ...row.options,
          // Unknown is an attempted check, not new evidence that overrides a quarantine.
          photoCheckAttempt: {
            state: result.state,
            checkedAt: result.checkedAt,
          },
          ...(result.state === "unknown"
            ? {}
            : {
                photoAudit: {
                  state: result.state,
                  checkedAt: result.checkedAt,
                  verifiedUrl: result.verifiedUrl,
                  placeholderUrls: result.placeholderUrls,
                  checks: result.checks,
                  originalImages:
                    row.options?.photoAudit?.originalImages ?? row.images,
                },
              }),
        },
        ...(result.state === "unknown" ? {} : { images: result.images }),
      };
      let query = client
        .from("deals")
        .update(patch)
        .eq("id", row.id)
        .eq("active", true);
      query = row.updated_at
        ? query.eq("updated_at", row.updated_at)
        : query.is("updated_at", null);
      const saved = await query.select("id").abortSignal(options.signal);
      if (saved.error) receipt.failed++;
      else if (!saved.data?.length) receipt.conflicts++;
      else {
        receipt.written++;
        await options.onWrite(row);
      }
    } catch {
      receipt.failed++;
      if (options.signal.aborted) break;
    }
  }
  return receipt;
}
