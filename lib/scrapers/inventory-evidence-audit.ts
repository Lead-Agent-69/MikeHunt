import { photoEvidence } from "@/lib/images/photo-evidence";
import { autotempestListingKey } from "@/lib/scrapers/sources/autotempest";
import type { Deal } from "@/types";

export type InventoryEvidenceRow = Pick<
  Deal,
  "source" | "source_deal_id" | "source_url" | "images"
> & {
  options?: {
    aggregator?: unknown;
    photoAudit?: unknown;
    [key: string]: unknown;
  } | null;
};

type SourceEvidence = {
  rows: number;
  identityGroups: number;
  collisionGroups: number;
  duplicateRows: number;
  usablePhotoRows: number;
  multiPhotoRows: number;
};

const emptySource = (): SourceEvidence => ({
  rows: 0,
  identityGroups: 0,
  collisionGroups: 0,
  duplicateRows: 0,
  usablePhotoRows: 0,
  multiPhotoRows: 0,
});

function usablePhotoCount(row: InventoryEvidenceRow): number {
  const audit = row.options?.photoAudit;
  const state =
    audit && typeof audit === "object" && "state" in audit
      ? String(audit.state || "").toLowerCase()
      : "";
  if (state === "unavailable" || state === "placeholder") return 0;
  return photoEvidence(row.images, audit).images.length;
}

/**
 * Read-only evidence for the AutoTempest canonical-identity rollout.
 * Counts are intentionally aggregate-only so receipts never publish listing URLs or VINs.
 */
export function inventoryIdentityAudit(rows: InventoryEvidenceRow[]) {
  const scoped = rows.filter(
    (row) =>
      String(row.options?.aggregator || "").toLowerCase() === "autotempest",
  );
  const identities = new Map<string, InventoryEvidenceRow[]>();
  let missingIdentityRows = 0;

  for (const row of scoped) {
    const key = autotempestListingKey({
      source: row.source,
      source_deal_id: row.source_deal_id,
      source_url: row.source_url,
    });
    if (!row.source_url && !row.source_deal_id) {
      missingIdentityRows++;
      continue;
    }
    const group = identities.get(key) || [];
    group.push(row);
    identities.set(key, group);
  }

  const bySource = new Map<string, SourceEvidence>();
  for (const row of scoped) {
    const source = String(row.source || "unknown").toLowerCase();
    const stats = bySource.get(source) || emptySource();
    const photos = usablePhotoCount(row);
    stats.rows++;
    if (photos > 0) stats.usablePhotoRows++;
    if (photos > 1) stats.multiPhotoRows++;
    bySource.set(source, stats);
  }

  let collisionGroups = 0;
  let duplicateRows = 0;
  for (const group of Array.from(identities.values())) {
    const source = String(group[0]?.source || "unknown").toLowerCase();
    const stats = bySource.get(source) || emptySource();
    stats.identityGroups++;
    if (group.length > 1) {
      collisionGroups++;
      duplicateRows += group.length - 1;
      stats.collisionGroups++;
      stats.duplicateRows += group.length - 1;
    }
    bySource.set(source, stats);
  }

  return {
    rows: scoped.length,
    identityGroups: identities.size,
    collisionGroups,
    duplicateRows,
    missingIdentityRows,
    bySource: Object.fromEntries(
      Array.from(bySource.entries()).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
}
