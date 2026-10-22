import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export const PRODUCTION_AUDIT_ARGS = Object.freeze([
  "audit",
  "--omit=dev",
  "--audit-level=high",
  "--json",
  "--fetch-timeout=30000",
  "--fetch-retries=0",
]);

const runNpmAudit = () =>
  spawnSync("npm", PRODUCTION_AUDIT_ARGS, {
    shell: process.platform === "win32",
    encoding: "utf8",
    maxBuffer: 5 * 1024 * 1024,
  });

/** Retry registry failures; only a complete, successful npm audit can pass the gate. */
export async function auditProductionDependencies({
  run = runNpmAudit,
  pause = () => delay(2000),
  log = console.log,
} = {}) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    log(`Production dependency audit attempt ${attempt}/3`);
    const result = run();
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    log(output.trim());
    let report;
    try {
      report = JSON.parse(result.stdout || "");
    } catch {
      // Missing/malformed reports cannot establish a successful security check.
    }
    const counts = report?.metadata?.vulnerabilities;
    const validCounts =
      counts &&
      ["info", "low", "moderate", "high", "critical", "total"].every(
        (key) => Number.isInteger(counts[key]) && counts[key] >= 0,
      );
    if (
      result.status === 0 &&
      !result.error &&
      !report?.error &&
      validCounts &&
      counts.high === 0 &&
      counts.critical === 0
    ) {
      log(
        `Production dependency audit passed: ${counts.total} vulnerabilities (${counts.high} high, ${counts.critical} critical).`,
      );
      return 0;
    }

    // Vulnerability findings, invalid reports and configuration errors fail immediately.
    const transient =
      /\b(?:E?50[0234]|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network timeout|request timed out)\b/i.test(
        `${output}\n${result.error?.code || ""}`,
      );
    if (
      !transient ||
      (validCounts && (counts.high > 0 || counts.critical > 0)) ||
      attempt === 3
    ) {
      log(
        "Production dependency audit failed; the security gate remains closed.",
      );
      return 1;
    }
    log("Temporary registry failure; retrying the complete audit.");
    await pause();
  }
  return 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await auditProductionDependencies();
}
