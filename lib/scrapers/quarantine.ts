import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Deal } from "@/types";
import { redactDiagnostic } from "./run-outcome";

/** Keep only review facts, not scraped HTML, seller contacts, cookies, or signed URLs. */
export async function quarantineRows(
  client: SupabaseClient,
  source: string,
  rows: Array<{ deal: Partial<Deal>; reason: string }>,
) {
  const unique = new Map<string, Record<string, unknown>>();
  for (const { deal, reason } of rows.slice(0, 1000)) {
    const observation = {
      sourceId: deal.source_deal_id || null,
      url: deal.source_url ? redactDiagnostic(deal.source_url) : null,
      year: Number.isFinite(deal.year) ? deal.year : null,
      price: Number.isFinite(deal.ask_price) ? deal.ask_price : null,
    };
    const fingerprint = createHash("sha256")
      .update(JSON.stringify([source, observation, reason]))
      .digest("hex");
    unique.set(fingerprint, {
      source,
      fingerprint,
      reason,
      observation,
      last_seen_at: new Date().toISOString(),
    });
  }
  if (!unique.size) return;
  const { error } = await client
    .from("scrape_quarantine")
    .upsert(Array.from(unique.values()), { onConflict: "fingerprint" });
  if (error)
    throw new Error(
      `Quarantine persistence unavailable: ${redactDiagnostic(error.message)}`,
    );
}
