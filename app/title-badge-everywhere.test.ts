import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { conditionFromTitleType } from "@/lib/deals/title-badge-model";

const read = (path: string) => readFileSync(path, "utf8");

// Every surface that shows a title uses the one TitleBadge (Amy's title-category helper
// underneath), so a card, the deal page, swipe and saved never disagree.
const SURFACES = [
  "components/discovery/DiscoveryCard.tsx",
  "components/shared/DealCard.tsx",
  "components/saved/SavedCarCard.tsx",
  "app/(dashboard)/deal/[id]/page.tsx",
  "app/(dashboard)/swipe/page.tsx",
];

describe("TitleBadge everywhere", () => {
  it.each(SURFACES)("%s renders <TitleBadge>", (path) => {
    const src = read(path);
    expect(src).toMatch(/from "(@\/components\/shared|\.)\/TitleBadge"/);
    expect(src).toMatch(/<TitleBadge\b/);
  });

  it("old per-card title chips are gone", () => {
    expect(read("components/discovery/DiscoveryCard.tsx")).not.toContain(
      "TITLE_STYLES",
    );
    expect(read("components/shared/DealCard.tsx")).not.toContain(
      "formatCondition(",
    );
    expect(read("components/saved/SavedCarCard.tsx")).not.toContain(
      "reported by listing\n                </Badge>\n              )}\n              {snapshot.damageType",
    );
  });

  it("legacy saved titleType tokens map to the bucket, never free text", () => {
    expect(conditionFromTitleType("salvage")).toBe("salvage_title");
    expect(conditionFromTitleType("parts_only")).toBe("parts_only");
    expect(conditionFromTitleType("Clean Carfax")).toBeNull();
    expect(conditionFromTitleType("run_drive")).toBeNull();
  });

  it("operability stays its own chip from readCondition", () => {
    const card = read("components/shared/DealCard.tsx");
    expect(card).toContain("readCondition(condition, damageType)");
    expect(read("components/discovery/DiscoveryCard.tsx")).toContain(
      "readCondition(",
    );
  });
});
