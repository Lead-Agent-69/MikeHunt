import { execFileSync } from "node:child_process";
import { checkScraperRelease } from "../lib/scrapers/release-provenance";

async function main() {
  const [revision, image, container, statusUrl] = process.argv.slice(2);
  if (
    process.argv.length !== 6 ||
    !/^[a-f0-9]{40}$/.test(revision || "") ||
    !image ||
    !container
  )
    throw new Error(
      "Usage: npx tsx scripts/verify-scraper-release.ts <exact-commit> <built-image> <container> <loopback-status-url>",
    );
  const url = new URL(statusUrl);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/status.json" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw new Error(
      "Use the worker's loopback HTTP /status.json URL, without credentials or parameters.",
    );
  const inspect = (args: string[]) =>
    JSON.parse(
      execFileSync("docker", args, {
        encoding: "utf8",
        windowsHide: true,
        timeout: 10_000,
        maxBuffer: 2 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  const built = inspect(["image", "inspect", image, "--format", "{{json .}}"]);
  const live = inspect([
    "container",
    "inspect",
    container,
    "--format",
    "{{json .}}",
  ]);
  const binding = live.NetworkSettings?.Ports?.["8787/tcp"]?.some(
    (port: { HostIp: string; HostPort: string }) =>
      port.HostPort === (url.port || "80") &&
      port.HostIp === (url.hostname === "[::1]" ? "::1" : "127.0.0.1"),
  );
  if (!binding)
    throw new Error(
      "Status URL is not a loopback port bound by this worker container.",
    );
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    redirect: "error",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Worker status request failed.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Worker status has no body.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 1024 * 1024) {
      await reader.cancel();
      throw new Error("Worker status exceeds the receipt size limit.");
    }
    chunks.push(value);
  }
  const status = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const result = checkScraperRelease({
    expectedRevision: revision,
    builtImageId: built.Id,
    runningImageId: live.Image,
    labels: built.Config?.Labels || {},
    running: live.State?.Running === true,
    containerStartedAt: live.State?.StartedAt,
    status,
  });
  // Do not print inspect/status payloads: they can contain credentials or private listing data.
  console.log(
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        ...result,
        expectedRevision: revision,
        builtImageId: built.Id,
        runningImageId: live.Image,
        containerId: live.Id,
        containerStartedAt: live.State?.StartedAt,
        statusUpdatedAt: status.updatedAt,
      },
      null,
      2,
    ),
  );
  if (!result.ok) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Release verification failed. Check the pinned commit, image/container IDs, loopback port and fresh worker metadata. No runtime changes were made.",
  );
  process.exitCode = 1;
});
