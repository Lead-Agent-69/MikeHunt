import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("parts page honesty", () => {
  const page = read("app/(dashboard)/parts/page.tsx");

  it("empty state does not leak DB enums or point at a missing Fleet control", () => {
    expect(page).not.toMatch(/parts_only or salvage_title in Fleet/);
    expect(page).not.toMatch(/Mark a vehicle as/);
    expect(page).toContain("Saved budgets");
  });

  it("missing entered costs never compute a teardown margin", () => {
    expect(page).toContain(
      "const margin = total === null || gross === null ? null : gross - total;",
    );
    expect(page).toContain("Not calculated");
    expect(page).not.toContain("roi.toFixed");
  });

  it("uses buyer-entered amounts instead of hardcoded example part values", () => {
    expect(page).toContain("budgetTotal(fields.map");
    expect(page).toContain("budgetAmount(income)");
    expect(page).not.toContain('name: "Engine (Complete)", value: 3800');
    expect(page).not.toContain("Example Parts Value");
  });
});
