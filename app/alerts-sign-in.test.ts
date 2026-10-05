import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("alerts page sign-in prompts", () => {
  const source = readFileSync("app/(dashboard)/alerts/page.tsx", "utf8");

  it("offers Sign in only after auth resolves with no session", () => {
    expect(source).toContain("const signedOut = authChecked && !userId;");
    expect(source).toContain(".finally(() => setAuthChecked(true))");
    expect(source).toMatch(
      /\{signedOut && \(\s*<Link\s+href="\/login\?next=%2Falerts"/,
    );
    expect(source).not.toMatch(/<Link\s+href="\/login"\s/);
  });

  it("drops the sign-in nudge from local inbox copy for signed-in users", () => {
    expect(source).toContain("signedOut={signedOut}");
    expect(source).toContain('"Stored on this device."');
  });
});
