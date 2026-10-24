import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Discover explicit dealer source scope", () => {
  const page = readFileSync(
    "app/(dashboard)/discover/page.tsx",
    "utf8",
  ).replace(/\r\n/g, "\n");

  it("projects selected dealer source IDs into the Discover request", () => {
    expect(page).toContain(
      'selectedSourceIds(searchParams.get("dealerSourceIds"))',
    );
    expect(page).toContain("watchedDealers: []");
    expect(page).toContain("watchedDealerSourceIds: explicitDealerSourceIds");
    expect(page).toContain(
      "makesParam.length ||\n      hasExplicitDealerScope",
    );
  });

  it("does not silently constrain a dealer-only link to the saved home market", () => {
    expect(page).toMatch(
      /const forceDealerNationwide\s*=\s*hasExplicitDealerScope && !hasExplicitLocation/,
    );
    expect(page).toMatch(
      /const savedStates = forceDealerNationwide\s*\? null\s*: savedScopeStates\(prefs\)/,
    );
    expect(page).toMatch(/forceDealerNationwide\s*\? ""/);
    expect(page).toContain("forceDealerNationwide ||");
  });
});
