import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("parts page honesty", () => {
  const page = read("app/(dashboard)/parts/page.tsx");

  it("empty state does not leak DB enums or point at a missing Fleet control", () => {
    expect(page).not.toMatch(/parts_only or salvage_title in Fleet/);
    expect(page).not.toMatch(/Mark a vehicle as/);
    expect(page).toContain("No parts or salvage vehicles saved yet.");
  });

  it("missing salvage cost shows a dash and never computes net/ROI", () => {
    expect(page).toContain("const hasCost = salvageCost > 0;");
    expect(page).toContain(
      "const net = hasCost ? partsValue - salvageCost : null;",
    );
    expect(page).toContain("cost needed");
    expect(page).not.toMatch(/: 0;\s*\n\s*const togglePart/);
  });

  it("hardcoded part prices are labeled as typical examples", () => {
    expect(page).toContain("not priced for this");
    expect(page).toContain("typical");
    expect(page).toContain("Example Parts Value");
  });
});
