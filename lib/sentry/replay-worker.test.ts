import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const prepare = require("../../scripts/prepare-replay-worker.cjs");

describe("same-origin replay compression worker", () => {
  it("copies the exact installed SDK worker and refreshes it repeatably", () => {
    const dir = mkdtempSync(join(tmpdir(), "mh-replay-worker-"));
    try {
      const target = prepare(join(dir, "public"));
      const expected = readFileSync(
        require.resolve("@sentry/replay/worker-bundler"),
      );
      expect(readFileSync(target)).toEqual(expected);
      expect(prepare(join(dir, "public"))).toBe(target);
      expect(readFileSync(target)).toEqual(expected);
      expect(expected.toString()).toContain('addEventListener("message"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
