import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Supabase environment normalization", () => {
  it("trims public and service keys before constructing clients", () => {
    const source = readFileSync("lib/supabase.ts", "utf8");

    expect(source).toContain(
      "process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()",
    );
    expect(source).toContain("process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()");
    expect(source).toContain("resolvedPublicAnonKey()");
  });
});
