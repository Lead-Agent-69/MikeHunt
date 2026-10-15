import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
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

  it("initializes and compresses through the installed worker message protocol", () => {
    const messages: Array<{
      method: string;
      success: boolean;
      response?: Uint8Array;
    }> = [];
    let receive: (event: {
      data: { id: number; method: string; arg: string };
    }) => void;
    runInNewContext(
      readFileSync(require.resolve("@sentry/replay/worker-bundler"), "utf8"),
      {
        TextEncoder,
        TextDecoder,
        console,
        addEventListener: (_type: string, handler: typeof receive) => {
          receive = handler;
        },
        postMessage: (message: (typeof messages)[number]) =>
          messages.push(message),
      },
    );
    expect(messages[0]).toMatchObject({ method: "init", success: true });
    receive!({ data: { id: 1, method: "compress", arg: '[{"type":1}]' } });
    expect(messages[1]).toMatchObject({ method: "compress", success: true });
    expect(Array.from(messages[1].response!.slice(0, 2))).toEqual([31, 139]);
  });
});
