import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Settings home state default", () => {
  const settings = readFileSync("app/(dashboard)/settings/page.tsx", "utf8");

  it("starts with no state picked instead of CA", () => {
    expect(settings).not.toContain('"CA"');
    expect(settings).toContain('home_state: "",');
    expect(settings).toContain(
      'home_state: profileData.profile.home_state || "",',
    );
    expect(settings).toContain('<option value="">No state picked</option>');
  });

  it("saves an unpicked home state as null", () => {
    expect(settings).toContain("home_state: profile.home_state || null,");
  });

  it("the dealer-defaults hook does not guess CA either", () => {
    const hook = readFileSync("hooks/useDealerDefaults.ts", "utf8");
    expect(hook).not.toContain('"CA"');
  });
});
