import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("onboarding goal scope", () => {
  it("carries watched dealer source ids through plan, health, and run scope", () => {
    const source = readFileSync("app/onboarding/page.tsx", "utf8");

    expect(source.indexOf("const dealerSourceIds = useMemo")).toBeLessThan(
      source.indexOf("const scopeInput = useMemo"),
    );
    expect(source).toContain("dealerSourceIds,");
    expect(source).toContain("sourceIds: requestedSourceIds");
    expect(source).toContain("watchedDealerSourceIds: dealerSourceIds");
  });
});
