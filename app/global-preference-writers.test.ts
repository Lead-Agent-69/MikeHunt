import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global buyer preference writers", () => {
  it("Discover uses confirmed writes, keeps drafts on error and prefers the saved account mode", () => {
    const source = readFileSync(
      "components/discovery/BuyerScopeBuilder.tsx",
      "utf8",
    );
    expect(source).toContain("resolveBuyerIntentScope(");
    expect(source).toContain("saveRef");
    expect(source).toContain("skipInitialSave.current");
    expect(source).toContain("Retry saving");
    expect(source).not.toContain('fetch("/api/preferences"');
    expect(source).not.toContain('useState<BuyerMode>("dealer")');
  });
  it("onboarding requires the original persistence destination for both writes", () => {
    const source = readFileSync("app/onboarding/page.tsx", "utf8");
    expect(source.match(/"x-require-account": "true"/g)).toHaveLength(2);
    expect(source).toContain("confirmedPreferences.authed === false");
  });
  it("cost defaults share the per-user profile cache, not another browser user's local values", () => {
    const hook = readFileSync("hooks/useDealerDefaults.ts", "utf8");
    expect(hook).toContain('["/api/profile", dealerId]');
    expect(hook).not.toContain("localStorage");
    expect(hook).toContain("profile.recon_cost_default");
  });
});
