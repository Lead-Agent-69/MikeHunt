import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("arbitrage soft-fail honesty", () => {
  const page = readFileSync("app/(dashboard)/arbitrage/page.tsx", "utf8");

  it("surfaces fetch failure without inventing a live scan or empty market win", () => {
    expect(page).toContain("arbitrage-load-error");
    expect(page).toContain("Could not load arbitrage routes right now.");
    expect(page).toContain("not running a live market scan");
    expect(page).toContain("Loading saved listings…");
    expect(page).not.toContain("Scanning the market");
    expect(page).not.toMatch(/local deals instantly/i);
    expect(page).toContain("if (!res.ok) throw new Error");
  });
});
