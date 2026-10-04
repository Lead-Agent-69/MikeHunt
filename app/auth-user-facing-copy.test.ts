import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("auth user-facing copy", () => {
  it("keeps technical setup details out of the normal login experience", () => {
    const login = readFileSync("app/(auth)/login/page.tsx", "utf8");
    const googleButton = readFileSync(
      "components/shared/GoogleButton.tsx",
      "utf8",
    );

    expect(login).not.toContain("Launch setup checklist");
    expect(login).not.toContain("Supabase Auth must have");
    expect(login).not.toContain("auth/callback");
    expect(googleButton).not.toContain("GOOGLE_OAUTH_VERIFIED");
    expect(googleButton).not.toContain(
      "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET",
    );
    expect(googleButton).toContain("Google sign-in is almost ready");
    expect(googleButton).toContain("View system status");
  });

  it("keeps the floating decision guide free of infrastructure language", () => {
    const copilot = readFileSync(
      "components/ui/next-level-features.tsx",
      "utf8",
    );

    expect(copilot).not.toContain("OPENAI_API_KEY");
    expect(copilot).not.toContain("GOOGLE_GENERATIVE_AI_API_KEY");
    expect(copilot).not.toContain("SCRAPE_SECRET");
    expect(copilot).not.toContain("CRON_SECRET");
    expect(copilot).not.toContain("provider key");
    expect(copilot).not.toContain("Supabase is not connected");
    expect(copilot).toContain("Decision guide");
  });
});
