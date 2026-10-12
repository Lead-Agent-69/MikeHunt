import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const run = (command, args) =>
  execFileSync(command, args, {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// No env inspection, customer rows, cleanup, container recreation or remote access.
export function auditStorage(execute = run, now = new Date()) {
  /** @type {Record<string, {status: string, [key: string]: unknown}>} */
  const checks = {};
  const report = {
    checkedAt: now.toISOString(),
    scope:
      "Current checkout and connected Docker host only; not a Zeus receipt.",
    hostedUsage:
      "unknown: local disk does not increase Supabase or Vercel quotas",
    checks,
    status: "unverified",
  };
  const check = (name, inspect) => {
    try {
      report.checks[name] = { status: "observed", ...inspect() };
    } catch {
      report.checks[name] = { status: "unknown" };
    }
  };
  check("gitObjects", () => ({
    value: execute("git", ["count-objects", "-vH"]),
  }));
  check("trackedRuntimeData", () => {
    const files = execute("git", [
      "ls-files",
      "--",
      "cache",
      ".cache",
      "logs",
      "profiles",
      ".codex-remote-attachments",
      "artifacts",
    ])
      .split(/\r?\n/)
      .filter(Boolean);
    return { status: files.length ? "warn" : "observed", files };
  });
  check("scraperMounts", () => {
    const mounts = JSON.parse(
      execute("docker", [
        "inspect",
        "mikehunt-scraper-1",
        "--format",
        "{{json .Mounts}}",
      ]),
    );
    const required = ["/app/cache", "/app/logs", "/app/profiles"];
    const persistent = mounts.filter((m) =>
      ["bind", "volume"].includes(m.Type),
    );
    const missing = required.filter(
      (destination) => !persistent.some((m) => m.Destination === destination),
    );
    return {
      status: missing.length ? "warn" : "observed",
      missing,
      mounts: persistent.map(({ Source, Destination, Type }) => ({
        source: Source,
        destination: Destination,
        type: Type,
      })),
    };
  });
  check("workerDisk", () => ({
    value: execute("docker", [
      "exec",
      "mikehunt-scraper-1",
      "sh",
      "-c",
      "du -sk /app/cache /app/logs /app/profiles && df -Pk /app/cache",
    ]),
  }));
  check("dockerLogging", () => {
    const config = JSON.parse(
      execute("docker", [
        "inspect",
        "mikehunt-scraper-1",
        "--format",
        "{{json .HostConfig.LogConfig}}",
      ]),
    );
    const options = config.Config ?? {};
    const bounded =
      config.Type === "json-file" &&
      /^\d+[kmg]$/i.test(options["max-size"] ?? "") &&
      parseInt(options["max-size"], 10) > 0 &&
      /^[1-9]\d*$/.test(options["max-file"] ?? "");
    return {
      status: bounded
        ? "observed"
        : config.Type === "json-file"
          ? "warn"
          : "unknown",
      driver: config.Type,
      maxSize: options["max-size"] ?? null,
      maxFiles: options["max-file"] ?? null,
    };
  });
  const results = Object.values(report.checks);
  report.status = results.some((c) => c.status === "warn")
    ? "warn"
    : results.some((c) => c.status === "unknown")
      ? "unverified"
      : "observed";
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = auditStorage();
  console.log(JSON.stringify(report, null, 2));
  process.exitCode =
    report.status === "warn" ? 1 : report.status === "unverified" ? 2 : 0;
}
