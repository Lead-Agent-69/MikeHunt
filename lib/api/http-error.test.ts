import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { internalError } from "./http-error";

describe("internalError", () => {
  it("never puts the real message in the body", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = internalError(
      "test",
      new Error("relation deals does not exist"),
    );
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe("Something went wrong");
    expect(JSON.stringify(body)).not.toContain("relation");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("API routes do not echo Error.message on 500s", () => {
  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (name === "route.ts") out.push(p);
    }
    return out;
  }

  it("no route.ts returns error: <err>.message for status 500", () => {
    const offenders: string[] = [];
    for (const file of walk("app/api")) {
      const src = readFileSync(file, "utf8");
      // Flag the classic leak patterns (message interpolated into a 500 JSON body).
      if (
        /error:\s*(e|err|error)\.message/.test(src) &&
        /status:\s*500/.test(src)
      ) {
        // Allow if it's only inside console.error
        const withoutLogs = src.replace(/console\.error\([^;]+;/g, "");
        if (/error:\s*(e|err|error)\.message/.test(withoutLogs)) {
          offenders.push(file);
        }
      }
      if (/details:\s*(e|err|error)\.message/.test(src)) {
        offenders.push(file + " (details)");
      }
    }
    expect(offenders).toEqual([]);
  });
});
