import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkScraperRelease,
  parseScraperRelease,
  readScraperRelease,
  type ScraperReleaseEvidence,
} from "./release-provenance";
import { writeScraperRelease } from "../../scripts/write-scraper-release";

const revision = "a".repeat(40);
const builtAt = "2026-10-17T10:00:00.000Z";
const raw = { version: 1, revision, builtAt, context: "git-archive" };
const now = Date.parse("2026-10-17T11:00:00.000Z");
const evidence = (): ScraperReleaseEvidence => ({
  expectedRevision: revision,
  builtImageId: `sha256:${"b".repeat(64)}`,
  runningImageId: `sha256:${"b".repeat(64)}`,
  running: true,
  containerStartedAt: "2026-10-17T10:59:00.000Z",
  labels: {
    "org.opencontainers.image.revision": revision,
    "org.opencontainers.image.created": builtAt,
    "io.mikehunt.scraper.context": "git-archive",
  },
  status: {
    release: parseScraperRelease(raw),
    startedAt: "2026-10-17T10:59:01.000Z",
    updatedAt: "2026-10-17T10:59:59.000Z",
  },
});
let dir: string | undefined;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
  dir = undefined;
});

describe("scraper image provenance", () => {
  it("writes and reads baked metadata while rejecting partial build declarations before touching disk", () => {
    dir = mkdtempSync(path.join(tmpdir(), "mh-release-test-"));
    const file = path.join(dir, "baked", "release.json");
    const metadata = { revision, builtAt, context: "git-archive" };
    expect(writeScraperRelease(metadata, file).status).toBe("known");
    expect(readScraperRelease(file)).toEqual(parseScraperRelease(raw));
    const before = readFileSync(file, "utf8");
    expect(() => writeScraperRelease({ revision }, file)).toThrow("Incomplete");
    expect(readFileSync(file, "utf8")).toBe(before);
  });
  it("writes explicit unknown metadata for a legacy build", () => {
    dir = mkdtempSync(path.join(tmpdir(), "mh-release-test-"));
    const file = path.join(dir, "legacy.json");
    expect(writeScraperRelease({}, file).status).toBe("unknown");
    expect(readScraperRelease(file).revision).toBeNull();
  });
  it("exposes only validated public release fields", () => {
    expect(parseScraperRelease({ ...raw, token: "must-not-leak" })).toEqual({
      version: 1,
      status: "known",
      revision,
      builtAt,
      context: "git-archive",
    });
  });
  it.each([
    null,
    {},
    { ...raw, revision: "main" },
    { ...raw, builtAt: "not-a-date" },
    { ...raw, builtAt: "2026-10-17" },
    { ...raw, context: "working-tree" },
    { ...raw, version: 2 },
  ])("does not infer missing/invalid metadata", (value) => {
    expect(parseScraperRelease(value)).toEqual({
      version: 1,
      status: "unknown",
      revision: null,
      builtAt: null,
      context: "unknown",
    });
  });
  it("reads the image file, fails closed on missing/bad/oversized files and does not mutate it", () => {
    dir = mkdtempSync(path.join(tmpdir(), "mh-release-test-"));
    const file = path.join(dir, "release.json");
    expect(readScraperRelease(file).status).toBe("unknown");
    writeFileSync(file, JSON.stringify(raw));
    const before = readFileSync(file, "utf8");
    expect(readScraperRelease(file).revision).toBe(revision);
    expect(readFileSync(file, "utf8")).toBe(before);
    writeFileSync(file, "{not-json");
    expect(readScraperRelease(file).status).toBe("unknown");
    writeFileSync(file, " ".repeat(5000));
    expect(readScraperRelease(file).status).toBe("unknown");
  });
  it("requires the expected built image, matching labels and fresh status from this container start", () => {
    expect(checkScraperRelease(evidence(), now)).toMatchObject({
      ok: true,
      errors: [],
    });
  });
  it("accepts Docker nanosecond timestamps without accepting a previous worker start", () => {
    const row = evidence();
    row.containerStartedAt = "2026-10-17T10:59:00.816280586Z";
    expect(checkScraperRelease(row, now).ok).toBe(true);
    row.status.startedAt = "2026-10-17T10:59:00.000Z";
    expect(checkScraperRelease(row, now).ok).toBe(false);
  });
  it.each([
    (row: ScraperReleaseEvidence) => {
      row.runningImageId = `sha256:${"c".repeat(64)}`;
    },
    (row: ScraperReleaseEvidence) => {
      row.expectedRevision = "main";
    },
    (row: ScraperReleaseEvidence) => {
      row.labels["org.opencontainers.image.revision"] = "c".repeat(40);
    },
    (row: ScraperReleaseEvidence) => {
      row.labels["org.opencontainers.image.created"] = "unknown";
    },
    (row: ScraperReleaseEvidence) => {
      row.running = false;
    },
    (row: ScraperReleaseEvidence) => {
      row.status.release = null;
    },
    (row: ScraperReleaseEvidence) => {
      row.status.release = { ...raw, version: 2 };
    },
    (row: ScraperReleaseEvidence) => {
      row.status.updatedAt = "2026-10-17T10:55:00.000Z";
    },
    (row: ScraperReleaseEvidence) => {
      row.status.updatedAt = "2026-10-17T11:01:00.000Z";
    },
    (row: ScraperReleaseEvidence) => {
      row.status.startedAt = "2026-10-16T10:59:00.000Z";
    },
    (row: ScraperReleaseEvidence) => {
      row.containerStartedAt = "invalid";
    },
  ])("rejects stale, unknown or mismatched deployment evidence", (change) => {
    const row = evidence();
    change(row);
    expect(checkScraperRelease(row, now).ok).toBe(false);
  });
});
