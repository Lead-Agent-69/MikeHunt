import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const shell =
  process.platform === "win32"
    ? "C:/Program Files/Git/bin/bash.exe"
    : "/bin/sh";
describe("local retention rehearsal targets", () => {
  for (const script of [
    "test-protected-retention.mjs",
    "test-retention-restore.mjs",
  ]) {
    it(`${script} rejects target arguments before accessing Docker`, () => {
      const result = spawnSync(
        process.execPath,
        [path.resolve("scripts", script), "--linked"],
        {
          encoding: "utf8",
          timeout: 5000,
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("accepts no target arguments");
    });
    it(`${script} rejects Docker host overrides before accessing Docker`, () => {
      const result = spawnSync(
        process.execPath,
        [path.resolve("scripts", script)],
        {
          env: { ...process.env, DOCKER_HOST: "tcp://example.invalid:2375" },
          encoding: "utf8",
          timeout: 5000,
        },
      );
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("DOCKER_HOST override is not allowed");
    });
  }
});
describe("disk janitor safety", () => {
  it.skipIf(!existsSync(shell))(
    "expires raw cache and rotated logs without touching active logs, state or profiles",
    async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "mh-janitor-test-"));
      try {
        const cache = path.join(root, "cache");
        const logs = path.join(root, "logs");
        const old = new Date("2025-01-01");
        for (const name of [
          "cache/polite/old.json",
          "cache/polite/recent.json",
          "cache/local-scraper-cache.json",
          "cache/profiles/session.json",
          "logs/scraper.log.1",
          "logs/scraper.log",
          "logs/status.json",
        ]) {
          const file = path.join(root, name);
          await mkdir(path.dirname(file), { recursive: true });
          await writeFile(file, "keep-or-expire");
          if (!name.includes("recent")) await utimes(file, old, old);
        }
        execFileSync(shell, [path.resolve("scripts/zeus-janitor.sh")], {
          env: { ...process.env, JANITOR_ROOT: cache, JANITOR_LOG_ROOT: logs },
          timeout: 15000,
        });
        expect(existsSync(path.join(cache, "polite/old.json"))).toBe(false);
        expect(existsSync(path.join(logs, "scraper.log.1"))).toBe(false);
        for (const name of [
          "cache/polite/recent.json",
          "cache/local-scraper-cache.json",
          "cache/profiles/session.json",
          "logs/scraper.log",
          "logs/status.json",
        ])
          expect(await readFile(path.join(root, name), "utf8")).toBe(
            "keep-or-expire",
          );
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
});
