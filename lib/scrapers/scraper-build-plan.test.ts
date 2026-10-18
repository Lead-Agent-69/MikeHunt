import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { scraperBuildPlan } from "../../scripts/build-scraper-image";

let dir: string;
const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const commit = () => {
  git("add", ".");
  git("commit", "-qm", "fixture");
  return git("rev-parse", "HEAD");
};
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mh-build-test-"));
  git("init", "-q");
  git("config", "user.name", "Local test");
  git("config", "user.email", "test@local.test");
  git("config", "core.autocrlf", "false");
  writeFileSync(path.join(dir, "Dockerfile.scraper"), "FROM scratch\n");
  writeFileSync(path.join(dir, "tracked.txt"), "committed code");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("pinned scraper image context", () => {
  it("uses committed archive bytes, not dirty code, untracked secrets or checkout HEAD", () => {
    const revision = commit();
    writeFileSync(path.join(dir, "tracked.txt"), "NEWER_COMMIT");
    commit();
    expect(git("rev-parse", "HEAD")).not.toBe(revision);
    writeFileSync(path.join(dir, "tracked.txt"), "UNCOMMITTED_CODE");
    writeFileSync(path.join(dir, ".env.local"), "UNTRACKED_SECRET");
    const plan = scraperBuildPlan(revision, "mikehunt-scraper:test", dir);
    expect(plan.workingTreeIncluded).toBe(false);
    expect(plan.archiveArgs).toEqual(["archive", "--format=tar", revision]);
    const archive = execFileSync("git", plan.archiveArgs, { cwd: dir });
    expect(archive.includes(Buffer.from("committed code"))).toBe(true);
    expect(archive.includes(Buffer.from("UNCOMMITTED_CODE"))).toBe(false);
    expect(archive.includes(Buffer.from("NEWER_COMMIT"))).toBe(false);
    expect(archive.includes(Buffer.from("UNTRACKED_SECRET"))).toBe(false);
    expect(readFileSync(path.join(dir, "tracked.txt"), "utf8")).toBe(
      "UNCOMMITTED_CODE",
    );
    expect(plan.dockerArgs).toContain(`SCRAPER_SOURCE_REVISION=${revision}`);
    expect(plan.dockerArgs.at(-1)).toBe("-");
  });
  it("rejects mutable refs, unknown commits and unsafe tags", () => {
    const revision = commit();
    expect(() => scraperBuildPlan("main", "image:test", dir)).toThrow("exact");
    expect(() => scraperBuildPlan("f".repeat(40), "image:test", dir)).toThrow();
    expect(() => scraperBuildPlan(revision, "--invalid", dir)).toThrow("tag");
  });
  it.each([".env.local", ".ENV.LOCAL"])(
    "refuses tracked runtime secrets %s even when a Docker ignore file might hide them",
    (name) => {
      writeFileSync(path.join(dir, name), "TEST_FIXTURE_NOT_A_SECRET");
      writeFileSync(path.join(dir, ".dockerignore"), ".env*\n");
      const revision = commit();
      expect(() => scraperBuildPlan(revision, "image:test", dir)).toThrow(
        "protected",
      );
    },
  );
  it("permits tracked example templates and validates build timestamps", () => {
    writeFileSync(path.join(dir, ".env.local.scraper.example"), "KEY=\n");
    const revision = commit();
    expect(scraperBuildPlan(revision, "image:test", dir).revision).toBe(
      revision,
    );
    expect(() =>
      scraperBuildPlan(revision, "image:test", dir, "bad-date"),
    ).toThrow("timestamp");
  });
});
