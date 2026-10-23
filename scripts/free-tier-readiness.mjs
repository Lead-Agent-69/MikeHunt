import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Decimal provider units; these are planning margins, not provider enforcement.
// Optional rows improve a receipt when available but do not turn an otherwise
// complete release check into "unverified" when a provider hides that meter.
export const resources = [
  {
    id: "databaseBytes",
    provider: "supabase",
    limit: 500_000_000,
    monthly: false,
    warnAt: 0.7,
    holdAt: 0.9,
  },
  {
    id: "storageBytes",
    provider: "supabase",
    limit: 1_000_000_000,
    monthly: false,
  },
  {
    id: "uncachedEgressBytes",
    provider: "supabase",
    limit: 5_000_000_000,
    monthly: true,
  },
  {
    id: "cachedEgressBytes",
    provider: "supabase",
    limit: 5_000_000_000,
    monthly: true,
    required: false,
  },
  {
    id: "activeUsers",
    provider: "supabase",
    limit: 50_000,
    monthly: true,
  },
  {
    id: "edgeInvocations",
    provider: "supabase",
    limit: 500_000,
    monthly: true,
  },
  {
    id: "realtimeMessages",
    provider: "supabase",
    limit: 2_000_000,
    monthly: true,
  },
  {
    id: "realtimePeakConnections",
    provider: "supabase",
    limit: 200,
    monthly: false,
  },
  {
    id: "logIngestionBytes",
    provider: "supabase",
    limit: 1_000_000_000,
    monthly: true,
    advisoryOnly: true,
  },
  {
    id: "logQueryBytes",
    provider: "supabase",
    limit: 100_000_000_000,
    monthly: true,
    advisoryOnly: true,
  },
  {
    id: "vercelCpuHours",
    provider: "vercel",
    limit: 4,
    monthly: true,
  },
  {
    id: "vercelMemoryGbHours",
    provider: "vercel",
    limit: 360,
    monthly: true,
  },
  {
    id: "vercelInvocations",
    provider: "vercel",
    limit: 1_000_000,
    monthly: true,
  },
  {
    id: "vercelTransferBytes",
    provider: "vercel",
    limit: 100_000_000_000,
    monthly: true,
  },
  {
    id: "vercelOriginBytes",
    provider: "vercel",
    limit: 10_000_000_000,
    monthly: true,
  },
  {
    id: "vercelCdnRequests",
    provider: "vercel",
    limit: 1_000_000,
    monthly: true,
  },
  {
    id: "vercelBuildHours",
    provider: "vercel",
    limit: 100,
    monthly: true,
  },
  {
    id: "vercelDeploymentStorageBytes",
    provider: "vercel",
    limit: 10_000_000_000,
    monthly: false,
  },
  {
    id: "vercelFunctionStorageBytes",
    provider: "vercel",
    limit: 10_000_000_000,
    monthly: false,
  },
  {
    id: "vercelSpeedInsightsPoints",
    provider: "vercel",
    limit: 10_000,
    monthly: true,
  },
  {
    id: "vercelImageSourceImages",
    provider: "vercel",
    limit: 1_000,
    monthly: true,
    required: false,
  },
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
  const rows = resources.map((resource) => {
    const {
      id,
      limit,
      monthly,
      provider,
      advisoryOnly = false,
      required = true,
      warnAt = 0.7,
      holdAt = 0.9,
    } = resource;
    const used = snapshot.usage?.[id];
    const fraction = snapshot.periodElapsed?.[provider];
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
      return {
        id,
        provider,
        required,
        advisoryOnly,
        limit,
        status: "unknown",
      };
    }
    const projected = monthly ? used / fraction : used;
    const ratio = Math.max(used, projected) / limit;
    const status = advisoryOnly
      ? ratio >= warnAt
        ? "warn"
        : "ok"
      : ratio >= holdAt
        ? "hold"
        : ratio >= warnAt
          ? "warn"
          : "ok";
    return {
      id,
      provider,
      required,
      advisoryOnly,
      used,
      limit,
      projected,
      ratio,
      status,
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
    eligibility === "unknown" ||
    rows.some((r) => r.required && r.status === "unknown");
  const warn = rows.some((r) => r.status === "warn");
  const actions = [];
  if (!fresh)
    actions.push("Refresh the provider-dashboard snapshot before release.");
  if (eligibility === "unknown")
    actions.push(
      "Confirm Vercel Hobby eligibility or choose an approved plan.",
    );
  if (eligibility === "ineligible")
    actions.push(
      "Hold launch until an approved Vercel plan or host is selected.",
    );
  const missing = rows.filter(
    (row) => row.required && row.status === "unknown",
  );
  if (missing.length)
    actions.push(
      `Record required meters: ${missing.map((row) => row.id).join(", ")}.`,
    );
  const held = rows.filter((row) => row.status === "hold");
  if (held.length)
    actions.push(
      `Pause new bulk imports and backfills; preserve reads and owner data. Review: ${held.map((row) => row.id).join(", ")}.`,
    );
  const warned = rows.filter((row) => row.status === "warn");
  if (warned.length)
    actions.push(
      `Investigate projected or advisory pressure: ${warned.map((row) => row.id).join(", ")}.`,
    );
  return {
    checkedAt: new Date(now).toISOString(),
    status: hold ? "hold" : unknown ? "unverified" : warn ? "warn" : "ok",
    snapshotFresh: fresh,
    eligibility,
    rows,
    actions,
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
