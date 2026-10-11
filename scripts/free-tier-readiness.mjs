import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Decimal provider units; these are planning margins, not provider enforcement.
export const resources = [
  { id: "databaseBytes", limit: 500_000_000, monthly: false },
  { id: "storageBytes", limit: 1_000_000_000, monthly: false },
  { id: "uncachedEgressBytes", limit: 5_000_000_000, monthly: true },
  { id: "cachedEgressBytes", limit: 5_000_000_000, monthly: true },
  { id: "activeUsers", limit: 50_000, monthly: true },
  { id: "edgeInvocations", limit: 500_000, monthly: true },
  { id: "realtimeMessages", limit: 2_000_000, monthly: true },
  { id: "vercelCpuHours", limit: 4, monthly: true },
  { id: "vercelMemoryGbHours", limit: 360, monthly: true },
  { id: "vercelInvocations", limit: 1_000_000, monthly: true },
  { id: "vercelTransferBytes", limit: 100_000_000_000, monthly: true },
  { id: "vercelOriginBytes", limit: 10_000_000_000, monthly: true },
  { id: "vercelCdnRequests", limit: 1_000_000, monthly: true },
  { id: "vercelImageTransforms", limit: 5_000, monthly: true },
  { id: "vercelImageReads", limit: 300_000, monthly: true },
  { id: "vercelImageWrites", limit: 100_000, monthly: true },
];

export function assessUsage(snapshot = {}, now = Date.now()) {
  const measuredAt =
    typeof snapshot.measuredAt === "string"
      ? Date.parse(snapshot.measuredAt)
      : NaN;
  const fresh =
    Number.isFinite(measuredAt) &&
    measuredAt <= now &&
    now - measuredAt <= 86_400_000;
  const rows = resources.map(({ id, limit, monthly }) => {
    const used = snapshot.usage?.[id];
    const fraction =
      snapshot.periodElapsed?.[id.startsWith("vercel") ? "vercel" : "supabase"];
    const validPeriod =
      !monthly ||
      (typeof fraction === "number" &&
        Number.isFinite(fraction) &&
        fraction > 0 &&
        fraction <= 1);
    if (
      !fresh ||
      typeof used !== "number" ||
      !Number.isFinite(used) ||
      used < 0 ||
      !validPeriod
    ) {
      return { id, limit, status: "unknown" };
    }
    const projected = monthly ? used / fraction : used;
    const ratio = Math.max(used, projected) / limit;
    return {
      id,
      used,
      limit,
      projected,
      status: ratio >= 0.9 ? "hold" : ratio >= 0.7 ? "warn" : "ok",
    };
  });
  const eligibility =
    snapshot.vercelHobbyEligible === true
      ? "confirmed"
      : snapshot.vercelHobbyEligible === false
        ? "ineligible"
        : "unknown";
  const hold =
    eligibility === "ineligible" || rows.some((r) => r.status === "hold");
  const unknown =
    eligibility === "unknown" || rows.some((r) => r.status === "unknown");
  const warn = rows.some((r) => r.status === "warn");
  return {
    checkedAt: new Date(now).toISOString(),
    status: hold ? "hold" : unknown ? "unverified" : warn ? "warn" : "ok",
    eligibility,
    rows,
    notice:
      "Read-only planning check. Does not enforce quotas, change plans, delete data, or certify features.",
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const snapshot = process.argv[2]
      ? JSON.parse(readFileSync(process.argv[2], "utf8"))
      : {};
    const report = assessUsage(snapshot);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode =
      report.status === "ok" ? 0 : report.status === "hold" ? 1 : 2;
  } catch {
    console.error(
      "Cannot read usage snapshot. Supply a valid JSON file; do not include credentials.",
    );
    process.exitCode = 2;
  }
}
