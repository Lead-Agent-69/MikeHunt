import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Saved page auth honesty", () => {
  const page = readFileSync("app/(dashboard)/saved/page.tsx", "utf8");

  it("does not push Sign-in CTA when dealerId is present", () => {
    expect(page).toContain("signedIn");
    expect(page).toContain("unavailable");
    expect(page).toContain(
      "You are signed in. Retry the connection or keep using local saves on this device.",
    );
    expect(page).toMatch(/\bRetry\b/);
    // Guest path still offers Sign in — but not the old always-on Check login.
    expect(page).not.toContain("Check login");
    expect(page).not.toContain(
      "Sign in or retry the connection to access account saves.",
    );
  });
});
