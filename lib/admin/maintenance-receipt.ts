function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function maintenanceReceipt(
  ok: boolean,
  result: Record<string, unknown>,
) {
  const written = count(
    result.updated ?? result.cachedDeals ?? result.rescored,
  );
  const processed = written ?? (ok ? count(result.scanned) : undefined);
  const failed = count(result.failed);
  return {
    confirmedChanges: (written ?? 0) > 0,
    description: ok
      ? processed === undefined
        ? "Task completed."
        : processed > 0
          ? `${processed.toLocaleString()} records processed.`
          : "There was nothing waiting."
      : written !== undefined
        ? `${written.toLocaleString()} updates confirmed${failed !== undefined ? `; ${failed.toLocaleString()} not confirmed` : ""}. Check the operational logs before retrying.`
        : "Completion could not be verified. Check the operational logs before retrying.",
  };
}
