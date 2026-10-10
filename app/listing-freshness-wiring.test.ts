import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("listing freshness wiring (Seen just now on old listings)", () => {
  it("cards and the deal page label freshness from first_seen + last_seen, not last_seen alone", () => {
    for (const p of [
      "components/shared/DealCard.tsx",
      "components/discovery/DiscoveryCard.tsx",
      "app/(dashboard)/deal/[id]/page.tsx",
    ]) {
      const src = read(p);
      expect(src).toContain("listingFreshnessLabel(");
      expect(src).not.toMatch(/relativeFreshness\((deal\.)?lastSeen(At)?\b/);
      expect(src).not.toContain("relativeFreshness(lastSeenAt || firstSeenAt)");
    }
  });

  it("scan/discover mappers never fabricate now() for a missing seen timestamp", () => {
    const scan = read("app/api/scan/route.ts");
    const discover = read("app/api/discover/route.ts");
    expect(scan).not.toMatch(
      /SeenAt: r\.\w+_seen_at \? new Date\(r\.\w+\) : new Date\(\)/,
    );
    expect(scan).not.toMatch(/SeenAt: row\.scraped_at \|\| new Date\(\)/);
    expect(discover).not.toMatch(/_seen_at: row\.scraped_at \|\| new Date\(\)/);
  });
});
