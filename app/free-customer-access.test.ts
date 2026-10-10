import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("customer tools remain free", () => {
  it.each([
    "app/api/deals/[id]/route.ts",
    "app/api/calibration/route.ts",
    "lib/scrapers/pipeline.ts",
  ])("%s cannot re-enable legacy payment gates", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toContain("GATING_ENABLED");
    expect(source).not.toContain("Upgrade to Pro");
    expect(source).not.toMatch(/status:\s*402/);
  });
});
