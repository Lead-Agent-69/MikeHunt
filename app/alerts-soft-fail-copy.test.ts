import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("alerts soft-fail + invent copy", () => {
  const page = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");

  it("does not sell live vehicles or invent an empty success when load fails", () => {
    expect(page).not.toMatch(/Open matching Scan for live/i);
    expect(page).toMatch(/Open matching Scan to search\s+saved inventory/);
    expect(page).toContain('error ? "Alerts could not load"');
    expect(page).toContain("not a live inbox refresh");
    expect(page).toContain("Server alerts couldn&apos;t load right now.");
  });
});
