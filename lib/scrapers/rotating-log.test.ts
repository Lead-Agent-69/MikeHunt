import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RotatingLog } from "./rotating-log";

describe("bounded worker file logs", () => {
  it("serializes writes, caps all four files, and keeps the newest messages", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mh-log-test-"));
    try {
      const file = path.join(dir, "scraper.log");
      const log = new RotatingLog(file, 16);
      for (let i = 0; i < 20; i++) log.write(`message-${i}\n`);
      await log.end();
      const files = await readdir(dir);
      expect(files.sort()).toEqual([
        "scraper.log",
        "scraper.log.1",
        "scraper.log.2",
        "scraper.log.3",
      ]);
      for (const name of files)
        expect((await stat(path.join(dir, name))).size).toBeLessThanOrEqual(16);
      expect(await readFile(file, "utf8")).toContain("message-19");
      expect(await readFile(`${file}.1`, "utf8")).toContain("message-18");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("bounds an oversized message", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "mh-log-test-"));
    try {
      const file = path.join(dir, "scraper.log");
      const log = new RotatingLog(file, 16);
      log.write("x".repeat(100));
      await log.end();
      expect((await stat(file)).size).toBe(16);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
