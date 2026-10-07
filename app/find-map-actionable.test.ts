import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";

describe("/find map uses actionable verdicts", () => {
  it("does not request go-only (empty under trust-gate HOLD demotion)", () => {
    const page = readFileSync("app/(dashboard)/find/page.tsx", "utf8");
    expect(page).toContain("/api/deals/map?verdict=actionable");
    expect(page).not.toContain('/api/deals/map?verdict=go"');
  });
});
