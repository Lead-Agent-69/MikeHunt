import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { buildBuyerIntentQuery } from "@/hooks/useBuyerIntent";

describe("Discover title filter: five buckets, sent as titleType", () => {
  it("BuyerScopeBuilder offers the shared five buckets", () => {
    const src = readFileSync(
      "components/discovery/BuyerScopeBuilder.tsx",
      "utf8",
    );
    expect(src).toContain(
      'const TITLE_TYPES = titleFilterOptions(null, "Any title")',
    );
    expect(src).not.toContain('{ label: "Rebuilt", value: "rebuilt" }');
  });

  it("a saved buyerScope.titleType reaches /api/discover as titleType", () => {
    const params = buildBuyerIntentQuery({ titleType: "rebuildable" } as never);
    expect(params.get("titleType")).toBe("rebuildable");
    expect(
      buildBuyerIntentQuery({ titleType: "all" } as never).has("titleType"),
    ).toBe(false);
  });
});
