import { appendFile, rename, rm, stat } from "node:fs/promises";

/** Serialize file writes and rotations; logs are disposable, scraper state is not. */
export class RotatingLog {
  private pending = Promise.resolve();
  private bytes: number | undefined;
  private queued = 0;
  constructor(
    private readonly file: string,
    private readonly maxBytes = 10 * 1024 * 1024,
  ) {}

  write(line: string): void {
    // Disk trouble must not create an unbounded in-memory log queue.
    if (this.queued >= 200) return;
    this.queued++;
    const output = Buffer.from(line.slice(0, 64 * 1024)).subarray(
      0,
      Math.min(this.maxBytes, 64 * 1024),
    );
    this.pending = this.pending
      .then(async () => {
        this.bytes ??= await stat(this.file)
          .then((s) => s.size)
          .catch((error) => {
            if (error.code === "ENOENT") return 0;
            throw error;
          });
        if (this.bytes + output.length > this.maxBytes) {
          await rm(`${this.file}.3`, { force: true });
          for (let i = 3; i >= 1; i--) {
            await rename(
              i === 1 ? this.file : `${this.file}.${i - 1}`,
              `${this.file}.${i}`,
            ).catch((error) => {
              if (error.code !== "ENOENT") throw error;
            });
          }
          this.bytes = 0;
        }
        await appendFile(this.file, output, { mode: 0o600 });
        this.bytes += output.length;
      })
      .catch((error) => {
        this.bytes = undefined;
        process.stderr.write(`[file-log] ${error.code || "write failed"}\n`);
      })
      .finally(() => {
        this.queued--;
      });
  }

  async end(): Promise<void> {
    await this.pending;
  }
}
