import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("read-only data audit", () => {
  const script = readFileSync("scripts/audit-data-quality.ts", "utf8");
  it("fails on query errors instead of silently reporting a clean audit", () => {
    expect(script.match(/throwOnError\(\)/g)?.length).toBe(13);
    expect(script).toContain("process.exit(1)");
  });
  it("paginates VIN reads without relying on an undeployed database function", () => {
    expect(script).toContain("fetchAllRows<{ id: string; vin: string }>");
    expect(script).toContain('.order("id")');
    expect(script).not.toContain("find_duplicate_vins");
    expect(script).not.toContain("count: missing.length");
    expect(script).not.toContain("count: invalid.length");
  });
});
