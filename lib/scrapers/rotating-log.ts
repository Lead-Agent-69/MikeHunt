import { appendFile, rename, rm, stat } from "node:fs/promises";

/** Single-writer disposable logs; never use this for scraper state or queues. */
export class RotatingLog {
  private pending = Promise.resolve();
  private bytes: number | undefined;
  private queued = 0;
  private closed = false;

  constructor(
    private readonly file: string,
    private readonly maxBytes = 10 * 1024 * 1024,
  ) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
      throw new RangeError("Log limit must be a positive byte count");
  }

  write(line: string): void {
    // Disk trouble must not create an unbounded in-memory log queue.
    if (this.closed || this.queued >= 200) return;
    this.queued++;
    const output = Buffer.from(line.slice(0, 64 * 1024)).subarray(
      0,
      Math.min(this.maxBytes, 64 * 1024),
    );
    this.pending = this.pending
      .then(async () => {
        this.bytes ??= await stat(this.file)
          .then((s) => s.size)
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return 0;
            throw error;
          });
        if (this.bytes + output.length > this.maxBytes) {
          await rm(`${this.file}.3`, { force: true });
          for (let i = 3; i >= 1; i--) {
            const from = i === 1 ? this.file : `${this.file}.${i - 1}`;
            const to = `${this.file}.${i}`;
            // Old pre-rotation logs may already exceed the cap. Logs alone
            // are disposable; discard oversize generations during migration.
            const size = await stat(from)
              .then((s) => s.size)
              .catch((error: NodeJS.ErrnoException) => {
                if (error.code === "ENOENT") return 0;
                throw error;
              });
            if (size > this.maxBytes) await rm(from, { force: true });
            else
              await rename(from, to).catch((error: NodeJS.ErrnoException) => {
                if (error.code !== "ENOENT") throw error;
              });
          }
          this.bytes = 0;
        }
        await appendFile(this.file, output, { mode: 0o600 });
        this.bytes += output.length;
      })
      .catch((error: NodeJS.ErrnoException) => {
        this.bytes = undefined;
        process.stderr.write(`[file-log] ${error.code || "write failed"}\n`);
      })
      .finally(() => {
        this.queued--;
      });
  }

  async end(): Promise<void> {
    this.closed = true;
    await this.pending;
  }
}
