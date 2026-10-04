import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("scrape-worker boot", () => {
  it("does not side-import ai-worker (that exits unless invent is reopened)", () => {
    const src = readFileSync("workers/scrape-worker.ts", "utf8");
    expect(src).not.toMatch(/import\s+["']\.\/ai-worker["']/);
    expect(src).not.toMatch(/from\s+["']\.\/ai-worker["']/);
    expect(src).toContain("ENABLE_LLM_PRICE_INVENT");
  });
});
