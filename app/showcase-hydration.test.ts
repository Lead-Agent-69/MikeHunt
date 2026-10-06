import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { polaroidTilt } from "@/components/ui/polaroid-flip-card";

describe("PolaroidGrid tilt", () => {
  it("is deterministic so server and client render the same transform", () => {
    for (let i = 0; i < 12; i++) {
      expect(polaroidTilt(i, 1, 5)).toBe(polaroidTilt(i, 1, 5));
    }
  });

  it("stays within the spread and keeps one decimal", () => {
    const values = Array.from({ length: 20 }, (_, i) => polaroidTilt(i, 2, 3));
    for (const v of values) {
      expect(Math.abs(v)).toBeLessThanOrEqual(3);
      expect(Math.round(v * 10) / 10).toBe(v);
    }
    expect(new Set(values).size).toBeGreaterThan(5);
  });

  it("does not call Math.random during render", () => {
    const source = readFileSync(
      join(process.cwd(), "components/ui/polaroid-flip-card.tsx"),
      "utf8",
    );
    expect(source).not.toContain("Math.random");
  });
});
