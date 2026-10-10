import "dotenv/config";
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  ACCESS_GRANTS,
  ACCESS_POLICY_REVISION,
} from "../lib/scrapers/access-policy";
import { configurationPreflight } from "../lib/release/configuration-preflight";

function value(flag: string) {
  const at = process.argv.indexOf(flag);
  if (at < 0) return undefined;
  const result = process.argv[at + 1];
  if (!result || result.startsWith("--"))
    throw new Error(`Missing ${flag} value`);
  return result;
}
try {
  const file = value("--env-file");
  if (file && config({ path: file, override: true, quiet: true }).error)
    throw new Error("Cannot load requested environment file");
  let projectRef = value("--expected-project-ref");
  if (!projectRef) {
    try {
      projectRef = readFileSync("supabase/.temp/project-ref", "utf8").trim();
    } catch {
      /* Require explicit identity if not linked. */
    }
  }
  if (!projectRef)
    throw new Error(
      "Provide --expected-project-ref for the intended hosted project",
    );
  const scope = value("--scope") || "all";
  if (!["core", "alerts", "all"].includes(scope))
    throw new Error("Scope must be core, alerts or all");
  const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const checks = configurationPreflight({
    env: process.env,
    grants: ACCESS_GRANTS,
    projectRef,
    scope: scope as "core" | "alerts" | "all",
  });
  const expectedSha = value("--expected-sha");
  if (expectedSha)
    checks.push({
      id: "deployment-sha",
      ok: expectedSha === gitSha,
      detail: "Checkout must equal the full reviewed deployment SHA.",
    });
  const dirty = execFileSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    { encoding: "utf8" },
  ).trim();
  checks.push({
    id: "tracked-checkout-clean",
    ok: !dirty,
    detail:
      "Build from committed tracked files; unrelated untracked operator files are not included in this check.",
  });
  console.log(
    JSON.stringify(
      {
        configurationReady: checks.every((c) => c.ok),
        deploymentAuthorized: false,
        gitSha,
        policyRevision: ACCESS_POLICY_REVISION,
        checks,
        remainingEvidence: [
          "Ren approval of final SHA",
          "verified backup and full-schema migration rehearsal",
          "approved-source re-observation and inventory impact review",
          "deployed app/worker/database compatibility",
          "real notification delivery and 48-hour canary",
        ],
      },
      null,
      2,
    ),
  );
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
} catch {
  console.error(
    "Preflight failed. Check arguments, project identity and environment-file access. No deployment was performed.",
  );
  process.exitCode = 1;
}
