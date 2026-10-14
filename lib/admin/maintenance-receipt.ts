function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function maintenanceReceipt(
  ok: boolean,
  result: Record<string, unknown>,
) {
  if (result.photoHealth === true) {
    const written = count(result.written) ?? 0;
    return {
      confirmedChanges: written > 0,
      description: `${count(result.checked) ?? 0} galleries checked; ${count(result.available) ?? 0} working, ${count(result.unavailable) ?? 0} missing, ${count(result.unknown) ?? 0} unverified. ${result.dryRun === true ? "Preview only; no changes made." : `${written} updates confirmed.`}${!ok ? " Some checks or writes could not finish." : ""}`,
    };
  }
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
