import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("local Supabase auth config", () => {
  it("allows the app callback URLs used by OAuth sign-in", () => {
    const config = readFileSync("supabase/config.toml", "utf8");

    expect(config).toContain('site_url = "http://127.0.0.1:3000"');
    expect(config).toContain('"http://127.0.0.1:3000/auth/callback"');
    expect(config).toContain('"http://localhost:3000/auth/callback"');
  });
});
