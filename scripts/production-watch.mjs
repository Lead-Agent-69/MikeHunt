import { pathToFileURL } from "node:url";

export const DEFAULT_PRODUCTION_URL = "https://mikehunt-69.vercel.app";

export function assessProductionStatus(body, maxFreshnessHours = 24) {
  const failures = [];
  const warnings = [];
  if (!body || typeof body !== "object")
    failures.push("invalid status payload");
  if (body?.configured !== true) failures.push("production is not configured");
  if (body?.buyerReady !== true) failures.push("buyer readiness is false");
  if (!Number.isFinite(body?.activeDeals) || body.activeDeals <= 0)
    failures.push("active inventory is unavailable");
  if (body?.freshness?.stale === true)
    failures.push("inventory freshness is stale");
  if (
    !Number.isFinite(body?.freshness?.newestAgeHours) ||
    body.freshness.newestAgeHours > maxFreshnessHours
  )
    failures.push("newest inventory exceeds the freshness window");
  if (body?.decisionReady !== true)
    warnings.push("decision evidence is not yet certified");
  if (
    !Number.isFinite(body?.freshPhotoListings) ||
    body.freshPhotoListings <= 0
  )
    warnings.push("fresh photo coverage is unavailable");
  return {
    status: failures.length ? "fail" : warnings.length ? "warn" : "ok",
    failures,
    warnings,
  };
}

export async function checkProduction({
  baseUrl = DEFAULT_PRODUCTION_URL,
  fetchImpl = fetch,
  maxFreshnessHours = 24,
} = {}) {
  const url = new URL("/api/system/status", baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetchImpl(url, {
      redirect: "manual",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok)
      return {
        checkedAt: new Date().toISOString(),
        url: url.toString(),
        status: "fail",
        failures: [`production status returned HTTP ${response.status}`],
        warnings: [],
      };
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json"))
      return {
        checkedAt: new Date().toISOString(),
        url: url.toString(),
        status: "fail",
        failures: ["production status did not return JSON"],
        warnings: [],
      };
    const body = await response.json();
    return {
      checkedAt: new Date().toISOString(),
      url: url.toString(),
      ...assessProductionStatus(body, maxFreshnessHours),
      evidence: {
        activeDeals: body.activeDeals,
        newLast24h: body.freshness?.newLast24h ?? null,
        newestAgeHours: body.freshness?.newestAgeHours ?? null,
        freshPhotoListings: body.freshPhotoListings ?? null,
        buyerReady: body.buyerReady === true,
        decisionReady: body.decisionReady === true,
      },
    };
  } catch (error) {
    return {
      checkedAt: new Date().toISOString(),
      url: url.toString(),
      status: "fail",
      failures: [
        error?.name === "AbortError"
          ? "production status timed out"
          : "production status request failed",
      ],
      warnings: [],
    };
  } finally {
    clearTimeout(timer);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = await checkProduction({ baseUrl: process.argv[2] });
  console.log(JSON.stringify(report, null, 2));
  for (const warning of report.warnings || [])
    console.log(`::warning::${warning}`);
  for (const failure of report.failures || [])
    console.log(`::error::${failure}`);
  process.exitCode = report.status === "fail" ? 1 : 0;
}
