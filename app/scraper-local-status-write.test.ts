import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local scraper status writer", () => {
  it("uses unique temp files and ensures the status directory exists per write", () => {
    const script = readFileSync("scripts/scrape-local.ts", "utf8");

    expect(script).toContain("await mkdir(statusDir, { recursive: true })");
    expect(script).toContain("Math.random()");
    expect(script).toContain("Date.now()");
    expect(script).toContain("await rename(tmp, STATUS_PATH)");
  });
});
