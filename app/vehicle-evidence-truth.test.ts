import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("vehicle evidence truth", () => {
  it("never invents photo defects, repair prices, or analysis progress", () => {
    const source = readFileSync(
      "components/deal/VisionDamageInspector.tsx",
      "utf8",
    );
    expect(source).toContain("MIKEHUNT has not analyzed these photos");
    expect(source).toContain("Photos supplied by the listing source");
    expect(source).not.toContain("setTimeout");
    expect(source).not.toContain("Subframe Mounting Stress Fracture");
    expect(source).not.toContain("unsplash.com");
    expect(source).not.toContain("confidence:");
    expect(source).toContain('aria-label="Next photo"');
  });

  it("does not present listing locations as official title history", () => {
    const source = readFileSync(
      "components/deal/TitleWashDetector.tsx",
      "utf8",
    );
    expect(source).toContain("Listing locations are not registration records");
    expect(source).toContain("has not been verified");
    expect(source).not.toContain("/api/vin/title-wash");
    const endpoint = readFileSync("app/api/vin/title-wash/route.ts", "utf8");
    expect(endpoint).toContain("available: false");
    expect(endpoint).not.toContain("riskScore");
    expect(endpoint).not.toContain("Date.now()");
  });
});
