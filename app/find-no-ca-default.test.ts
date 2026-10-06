import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("/find home state default", () => {
  const page = readFileSync("app/(dashboard)/find/page.tsx", "utf8");

  it("does not default to CA", () => {
    expect(page).not.toContain('"CA"');
    expect(page).toContain('effectiveHome(prefs)?.state ?? ""');
  });

  it("offers an empty 'No state picked' option", () => {
    expect(page).toContain('{ value: "", label: "No state picked" }');
  });

  it("does not query arbitrage until a state is picked", () => {
    expect(page).toContain("dealerId && !dealerLoading && homeState");
    expect(page).toContain('data-testid="find-pick-state"');
  });
});
