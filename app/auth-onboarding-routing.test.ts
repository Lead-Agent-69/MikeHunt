import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("new-account onboarding routes", () => {
  it("sends both email and Google registration through onboarding", () => {
    const register = readFileSync("app/(auth)/register/page.tsx", "utf8");

    expect(register).toContain(
      "emailRedirectTo: `${window.location.origin}/auth/callback?next=/onboarding`",
    );
    expect(register).toContain('<GoogleButton next="/onboarding"');
  });

  it("preserves a safe requested destination when a returning user signs in", () => {
    const login = readFileSync("app/(auth)/login/page.tsx", "utf8");

    expect(login).toContain("new URLSearchParams(window.location.search)");
    expect(login).toContain('useState("/discover")');
    expect(login).toContain('safeNextPath(params.get("next"))');
    expect(login).toContain(
      "postLoginDestination(account.onboarded === true, next)",
    );
    expect(login).toContain("<GoogleButton next={next}");
  });

  it("keeps post-auth destinations inside the app", () => {
    expect(safeNextPath("/deal-check?vehicle=123")).toBe(
      "/deal-check?vehicle=123",
    );
    expect(safeNextPath("//example.com")).toBe("/discover");
    expect(safeNextPath("https://example.com")).toBe("/discover");
    expect(safeNextPath("/\\example.com")).toBe("/discover");
  });

  it("does not let the onboarding logo skip setup", () => {
    const onboarding = readFileSync("app/onboarding/page.tsx", "utf8");
    expect(onboarding).not.toContain('href="/discover"');
    expect(onboarding).toContain("Choose a state");
    expect(onboarding).toContain('value="Nationwide"');
    expect(onboarding).toContain("scopeChosen");
  });

  it("keeps signed-in unfinished buyers off the public buyer pages", () => {
    const proxy = readFileSync("proxy.ts", "utf8");
    expect(proxy).toContain(
      'const publicBuyerRoutes = ["/scan", "/dealer-network", "/tools"];',
    );
    // Signed-out visitors still reach /scan from the landing page.
    expect(proxy).toContain('// "/scan", — intentionally public');
    // The setup redirect uses the wider set for real and guest sessions.
    expect(proxy.match(/isSetupGatedRoute &&/g)?.length).toBe(2);
    expect(proxy).not.toMatch(/userId &&\s+isProtectedRoute &&/);
  });
});
