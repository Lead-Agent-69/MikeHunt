import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Discover prefs hydrate flash", () => {
  it("holds discover fetch and avoids Nationwide until prefs load", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    expect(page).toContain("isLoading: prefsLoading");
    expect(page).toContain("discoverReady");
    expect(page).toContain(
      "discoverReady ? `/api/discover${scopeQuery}` : null",
    );
    expect(page).toContain('prefsLoading ? "your home state" : "Nationwide"');
    expect(page).toContain("(!discoverReady || isLoading) && !data");
  });

  it("nav chip does not claim All states while prefs are loading", () => {
    const chip = readFileSync("components/shared/MyStatesButton.tsx", "utf8");
    expect(chip).toContain("isLoading: prefsLoading");
    expect(chip).toContain("prefsLoading");
    expect(chip).toContain('? "…"');
  });
});
