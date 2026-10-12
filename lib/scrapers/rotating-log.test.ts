import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { RotatingLog } from "./rotating-log";

async function fixture(run: (file: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mh-log-test-"));
  try {
    await run(path.join(dir, "scraper.log"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("bounded worker file logs", () => {
  it("serializes writes and keeps the newest messages in at most four files", async () => {
    await fixture(async (file) => {
      const log = new RotatingLog(file, 16);
      for (let i = 0; i < 20; i++) log.write(`message-${i}\n`);
      await log.end();
      const files = await readdir(path.dirname(file));
      expect(files.sort()).toEqual([
        "scraper.log",
        "scraper.log.1",
        "scraper.log.2",
        "scraper.log.3",
      ]);
      for (const name of files)
        expect(
          (await stat(path.join(path.dirname(file), name))).size,
        ).toBeLessThanOrEqual(16);
      expect(await readFile(file, "utf8")).toContain("message-19");
      expect(await readFile(`${file}.1`, "utf8")).toContain("message-18");
    });
  });

  it("caps UTF-8 bytes rather than character count", async () => {
    await fixture(async (file) => {
      const log = new RotatingLog(file, 16);
      log.write("\u00e9".repeat(100));
      await log.end();
      expect((await stat(file)).size).toBe(16);
    });
  });

  it("accounts for existing bytes after restart", async () => {
    await fixture(async (file) => {
      await writeFile(file, "previous-log\n");
      const log = new RotatingLog(file, 16);
      log.write("new-log\n");
      await log.end();
      expect(await readFile(`${file}.1`, "utf8")).toBe("previous-log\n");
      expect(await readFile(file, "utf8")).toBe("new-log\n");
    });
  });

  it("discards only oversize legacy log generations, not adjacent state", async () => {
    await fixture(async (file) => {
      for (const suffix of ["", ".1", ".2", ".3"])
        await writeFile(`${file}${suffix}`, "x".repeat(100));
      const state = path.join(path.dirname(file), "status.json");
      await writeFile(state, '{"quota":1000}');
      const log = new RotatingLog(file, 16);
      log.write("new-log\n");
      await log.end();
      expect((await readdir(path.dirname(file))).sort()).toEqual([
        "scraper.log",
        "status.json",
      ]);
      expect(await readFile(state, "utf8")).toBe('{"quota":1000}');
    });
  });

  it("caps pending writes and rejects writes after close", async () => {
    await fixture(async (file) => {
      const log = new RotatingLog(file, 1024);
      for (let i = 0; i < 1000; i++) log.write("x");
      await log.end();
      log.write("late");
      await log.end();
      expect((await stat(file)).size).toBe(200);
    });
  });

  it("does not crash the worker when its log directory is unavailable", async () => {
    await fixture(async (file) => {
      const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      try {
        const log = new RotatingLog(path.join(file, "missing.log"), 16);
        log.write("hello");
        await log.end();
        expect(stderr).toHaveBeenCalledWith("[file-log] ENOENT\n");
      } finally {
        stderr.mockRestore();
      }
    });
  });

  it.each([0, -1, NaN, Infinity, 1.5])(
    "rejects invalid byte limit %s",
    (limit) => {
      expect(() => new RotatingLog("unused", limit)).toThrow(RangeError);
    },
  );
});
