import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("neutral shopping guidance", () => {
  it.each([
    [
      "components/discovery/BuyerScopeBuilder.tsx",
      "Damaged vehicles and rebuild candidates",
    ],
    ["app/(dashboard)/auctions/page.tsx", "e.g. Dallas auction, Lane C"],
    [
      "app/(dashboard)/save/page.tsx",
      "Share the original vehicle listing link",
    ],
    [
      "app/api/discover/route.ts",
      "Auction inventory from vehicle and government sales",
    ],
  ])("keeps feature instructions unbranded in %s", (file, copy) => {
    const code = readFileSync(file, "utf8");
    expect(code).toContain(copy);
    expect(code).not.toMatch(
      /Copart\/IAA-style|e\.g\. Copart|valid Copart|inventory \(Copart\/IAA/,
    );
  });
});
