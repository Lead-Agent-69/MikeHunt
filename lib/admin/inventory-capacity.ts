export type InventoryCapacity = {
  checkedAt: string;
  databaseBytes: number;
  relations: Array<{
    schema_name: string;
    table_name: string;
    total_bytes: number;
    table_bytes: number;
    index_bytes: number;
    estimated_live_rows: number;
    estimated_dead_rows: number;
  }>;
  inventory: {
    total: number;
    active: number;
    unseen30Days: number;
    unseen7Days: number;
  };
  archive: {
    policyDays: 30;
    actionsEnabled: false;
    eligibilityAssessed: false;
  };
};

const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** Fail closed rather than present missing or malformed diagnostics as spare capacity. */
export function inventoryCapacity(value: unknown): InventoryCapacity | null {
  if (!value || typeof value !== "object") return null;
  const report = value as InventoryCapacity;
  if (
    typeof report.checkedAt !== "string" ||
    !Number.isFinite(Date.parse(report.checkedAt)) ||
    !count(report.databaseBytes) ||
    report.databaseBytes === 0 ||
    !report.inventory ||
    ![
      report.inventory.total,
      report.inventory.active,
      report.inventory.unseen30Days,
      report.inventory.unseen7Days,
    ].every(count) ||
    report.inventory.active > report.inventory.total ||
    report.inventory.unseen30Days > report.inventory.unseen7Days ||
    report.inventory.unseen7Days > report.inventory.total ||
    report.archive?.policyDays !== 30 ||
    report.archive.actionsEnabled !== false ||
    report.archive.eligibilityAssessed !== false ||
    !Array.isArray(report.relations) ||
    report.relations.length > 20 ||
    report.relations.some(
      (row) =>
        !row ||
        !["public", "auth", "storage"].includes(row.schema_name) ||
        typeof row.table_name !== "string" ||
        !row.table_name.length ||
        ![
          row.total_bytes,
          row.table_bytes,
          row.index_bytes,
          row.estimated_live_rows,
          row.estimated_dead_rows,
        ].every(count),
    )
  )
    return null;
  return report;
}

export function capacitySummary(report: InventoryCapacity) {
  return {
    state:
      report.databaseBytes >= 450_000_000
        ? "critical"
        : report.databaseBytes >= 350_000_000
          ? "warning"
          : "normal",
    archiveMessage:
      report.inventory.unseen30Days === 0
        ? "No listings have reached the 30-day archive cutoff. Archiving cannot free inventory capacity today."
        : `${report.inventory.unseen30Days.toLocaleString()} listings exceed 30 days without reobservation. Protected references and recovery must be checked before any archival.`,
  };
}
