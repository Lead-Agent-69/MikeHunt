import { readFileSync, statSync } from "node:fs";

export const SCRAPER_RELEASE_PATH = "/opt/mikehunt/scraper-release.json";
export interface ScraperRelease {
  version: 1;
  status: "known" | "unknown";
  revision: string | null;
  builtAt: string | null;
  context: "git-archive" | "unknown";
}

export function parseScraperRelease(value: unknown): ScraperRelease {
  const unknown: ScraperRelease = {
    version: 1,
    status: "unknown",
    revision: null,
    builtAt: null,
    context: "unknown",
  };
  if (!value || typeof value !== "object") return unknown;
  const row = value as Record<string, unknown>;
  if (
    row.version !== 1 ||
    row.context !== "git-archive" ||
    typeof row.revision !== "string" ||
    !/^[a-f0-9]{40}$/.test(row.revision) ||
    typeof row.builtAt !== "string" ||
    !Number.isFinite(Date.parse(row.builtAt)) ||
    new Date(row.builtAt).toISOString() !== row.builtAt
  )
    return unknown;
  return {
    version: 1,
    status: "known",
    revision: row.revision,
    builtAt: row.builtAt,
    context: "git-archive",
  };
}

/** Only the image file is authoritative here; env and mutable checkout state are not fallbacks. */
export function readScraperRelease(
  file = SCRAPER_RELEASE_PATH,
): ScraperRelease {
  try {
    if (statSync(file).size > 4096) return parseScraperRelease(null);
    const raw = readFileSync(file, "utf8");
    if (raw.length > 4096) return parseScraperRelease(null);
    return parseScraperRelease(JSON.parse(raw));
  } catch {
    return parseScraperRelease(null);
  }
}

export interface ScraperReleaseEvidence {
  expectedRevision: string;
  builtImageId: string;
  runningImageId: string;
  labels: Record<string, string>;
  running: boolean;
  containerStartedAt: string;
  status: { release?: unknown; startedAt?: string; updatedAt?: string };
}

export function checkScraperRelease(
  evidence: ScraperReleaseEvidence,
  now = Date.now(),
) {
  const release = parseScraperRelease(evidence.status.release);
  const errors: string[] = [];
  if (!/^[a-f0-9]{40}$/.test(evidence.expectedRevision))
    errors.push("Expected revision must be an exact commit.");
  if (
    !/^sha256:[a-f0-9]{64}$/.test(evidence.builtImageId) ||
    evidence.builtImageId !== evidence.runningImageId
  )
    errors.push("Running container does not use the expected built image.");
  if (!evidence.running) errors.push("Container is not running.");
  if (
    release.status !== "known" ||
    release.revision !== evidence.expectedRevision
  )
    errors.push(
      "Worker release is unknown or differs from the expected commit.",
    );
  if (
    evidence.labels["org.opencontainers.image.revision"] !== release.revision ||
    evidence.labels["org.opencontainers.image.created"] !== release.builtAt ||
    evidence.labels["io.mikehunt.scraper.context"] !== "git-archive"
  )
    errors.push("Image labels and worker release do not agree.");
  const containerStart = Date.parse(evidence.containerStartedAt);
  const workerStart = Date.parse(evidence.status.startedAt || "");
  const updated = Date.parse(evidence.status.updatedAt || "");
  const built = Date.parse(release.builtAt || "");
  if (
    ![containerStart, workerStart, updated, built].every(Number.isFinite) ||
    built > containerStart ||
    workerStart < containerStart ||
    workerStart > updated ||
    updated > now + 30_000 ||
    now - updated > 120_000
  )
    errors.push(
      "Build/status timestamps are unknown, stale or do not match this container start.",
    );
  return { ok: errors.length === 0, release, errors };
}
