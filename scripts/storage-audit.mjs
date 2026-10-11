// Read-only operator audit. No env/credentials, customer rows, cleanup, or Docker changes.
import { execFileSync } from "node:child_process";
const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", timeout: 30000 }).trim();
const report = {
  checkedAt: new Date().toISOString(),
  hostedUsage:
    "Check provider dashboards; local disk does not increase hosted quotas.",
};
try {
  const mountInfo = JSON.parse(
    run("docker", [
      "inspect",
      "mikehunt-scraper-1",
      "--format",
      "{{json .Mounts}}",
    ]),
  );
  report.scraperMounts = mountInfo.map(({ Source, Destination, Type }) => ({
    source: Source,
    destination: Destination,
    type: Type,
  }));
  report.workerDisk = run("docker", [
    "exec",
    "mikehunt-scraper-1",
    "sh",
    "-c",
    "du -sh /app/cache /app/logs /app/profiles; df -h /app/cache",
  ]);
  report.dockerLogging = JSON.parse(
    run("docker", [
      "inspect",
      "mikehunt-scraper-1",
      "--format",
      "{{json .HostConfig.LogConfig}}",
    ]),
  );
} catch {
  report.workerDisk = "Unavailable: inspect the actual Zeus host locally.";
}
report.gitObjects = run("git", ["count-objects", "-vH"]);
report.trackedRuntimeData = run("git", [
  "ls-files",
  "--",
  "cache",
  ".cache",
  "logs",
  "profiles",
  ".codex-remote-attachments",
  "artifacts",
]);
console.log(JSON.stringify(report, null, 2));
if (report.trackedRuntimeData) process.exitCode = 1;
