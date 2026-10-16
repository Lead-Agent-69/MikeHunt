import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listingIdBatches } from "./local-cache";
import { correctedPriceHistoryCutoff } from "@/lib/data-quality/dealer-correction";

/** Dealer-local stock numbers and URL tails are not unique across independent dealers. */
export function dealerListingId(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password)
    throw new Error("Invalid dealer listing URL");
  for (const key of Array.from(url.searchParams.keys()))
    if (/^(utm_|fbclid$|gclid$|msclkid$)/i.test(key))
      url.searchParams.delete(key);
  url.searchParams.sort();
  const identity = `${url.host.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}?${url.searchParams}`;
  return `dealer-url:${createHash("sha256").update(identity).digest("hex")}`;
}

/** Keep existing UUIDs and saved references, but never borrow another dealer's local ID. */
export async function preserveExistingDealerListingIds(
  client: SupabaseClient,
  rows: Array<{
    source: string | undefined;
    source_url: string | undefined;
    source_deal_id: string;
    options?: Record<string, any> | null;
  }>,
) {
  const candidates = rows.filter(
    (row) =>
      row.source === "independent_dealer" &&
      row.source_url &&
      (row.source_deal_id.startsWith("dealer-url:") ||
        (row.source_deal_id.startsWith("4cdg-drivenation-com-") &&
          row.source_url.startsWith(
            "https://www.drivenation.com/vehiclesDetail.php?",
          ))),
  );
  if (!candidates.length) return;
  for (const urls of listingIdBatches(
    Array.from(new Set(candidates.map((row) => row.source_url!))),
  )) {
    const { data, error } = await client
      .from("deals")
      .select("source_url,source_deal_id,options")
      .eq("source", "independent_dealer")
      .in("source_url", urls)
      .limit(1000)
      .abortSignal(AbortSignal.timeout(5_000));
    if (error || (data?.length ?? 0) >= 1000)
      throw new Error(
        "Existing dealer identities could not be verified completely",
      );
    const stored = new Map<string, Set<string>>();
    const corrections = new Map<string, Record<string, any>>();
    for (const row of data || []) {
      const ids = stored.get(row.source_url) ?? new Set<string>();
      ids.add(row.source_deal_id);
      stored.set(row.source_url, ids);
      if (correctedPriceHistoryCutoff(row))
        corrections.set(
          `${row.source_url}|${row.source_deal_id}`,
          row.options.sourceCorrection,
        );
    }
    for (const row of candidates) {
      const ids = stored.get(row.source_url!);
      // Multiple historical records are ambiguous: keep the URL-scoped identity, never guess.
      if (
        row.source_deal_id.startsWith("dealer-url:") &&
        !ids?.has(row.source_deal_id) &&
        ids?.size === 1
      )
        row.source_deal_id = Array.from(ids)[0];
      const correction = corrections.get(
        `${row.source_url}|${row.source_deal_id}`,
      );
      if (correction)
        row.options = { ...(row.options || {}), sourceCorrection: correction };
    }
  }
}
