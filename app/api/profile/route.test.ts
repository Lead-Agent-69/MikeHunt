import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("profile persistence compatibility", () => {
  it("only writes columns that exist in the user_profiles schema", () => {
    const source = readFileSync("app/api/profile/route.ts", "utf8");
    const updatesBlock = source.slice(
      source.indexOf("const updates ="),
      source.indexOf("// Geocode the dealer's home"),
    );

    expect(updatesBlock).not.toContain("updated_at:");
    expect(updatesBlock).not.toContain("{ state: body.state }");
    expect(updatesBlock).toContain("{ home_state: body.state }");
    expect(updatesBlock).toContain("onboarded: body.onboarded");
    expect(source).toContain(
      "if (body.home_zip !== undefined || body.city !== undefined)",
    );
  });
});
