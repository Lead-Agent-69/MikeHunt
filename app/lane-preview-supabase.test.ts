import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "app/(dashboard)/lane/page.tsx"),
  "utf8",
);

describe("Auction Lane without Supabase env", () => {
  it("skips Supabase queries when the client would point at the placeholder host", () => {
    expect(source).toContain("isSupabaseConfigured()");
    const guard = source.indexOf("if (!databaseConfigured) return;");
    const firstQuery = source.indexOf('.from("');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstQuery);
  });

  it("explains the empty lane instead of claiming no matches", () => {
    expect(source).toContain("Run lists are not available in this preview.");
  });
});
