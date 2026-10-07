import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("discover soft-fail honesty", () => {
  const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");

  it("surfaces fetch failure without inventing a live scan", () => {
    expect(page).toContain("discover-load-error");
    expect(page).toContain("Could not load discovery right now");
    expect(page).toContain("not running a live market scan");
    expect(page).toContain("Checking saved listings");
    expect(page).not.toMatch(/live results/i);
    expect(page).toContain("matching results");
    expect(page).not.toMatch(/Live Scanner/i);
    expect(page).not.toMatch(/constantly scanning/i);
  });
});
