import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
    expect(login).toContain('requestedNext?.startsWith("/")');
    expect(login).toContain("<GoogleButton next={next}");
  });
});
