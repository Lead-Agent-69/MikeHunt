import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");

describe("Discover layout density", () => {
  it("top-aligns cards so one long card cannot create blank space in its row", () => {
    expect(scan).toMatch(/density === "compact"[\s\S]{0,120}"grid items-start/);
    expect(scan).toMatch(/: "grid items-start grid-cols-1/);
  });

  it("does not repeat primary toolbar values as applied-filter pills", () => {
    expect(scan).toContain(
      "const appliedDetailFilters = appliedFilters.filter",
    );
    expect(scan).toContain("appliedDetailFilters.map");
    expect(scan).toContain("Clear filters");
  });
});
