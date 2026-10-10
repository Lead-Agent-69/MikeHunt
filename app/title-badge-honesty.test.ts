import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  cleanTitleConflicts,
  hasRepairableSignal,
} from "@/lib/intelligence/title-signal";
import { formatCondition } from "@/components/shared/deal-card/utils";

const read = (path: string) => readFileSync(path, "utf8");

describe("title badge never contradicts repairable evidence", () => {
  it("helper prefers the cautious signal", () => {
    expect(
      cleanTitleConflicts("clean_title", { damageType: "flood damage" }),
    ).toBe(true);
    expect(cleanTitleConflicts("clean", { condition: "repairable" })).toBe(
      true,
    );
    expect(cleanTitleConflicts("clean", { repairableEvidence: true })).toBe(
      true,
    );
    expect(
      cleanTitleConflicts("clean_title", { condition: "clean_title" }),
    ).toBe(false);
    expect(cleanTitleConflicts("salvage", { damageType: "damage" })).toBe(
      false,
    );
    expect(hasRepairableSignal("clean_title")).toBe(false);
  });

  it("DealCard condition chip downgrades clean title", () => {
    expect(formatCondition("clean_title", "front end damage")).not.toContain(
      "Clean title reported",
    );
    expect(formatCondition("clean_title", "front end damage")).toContain(
      "Title unconfirmed",
    );
    expect(formatCondition("clean_title")).toBe("Clean title reported");
    expect(formatCondition("clean_title", "used")).toBe(
      "Clean title reported · used",
    );
  });

  it("Saved/Discovery cards and deal header use the shared helper", () => {
    for (const path of [
      "components/saved/SavedCarCard.tsx",
      "components/discovery/DiscoveryCard.tsx",
      "app/(dashboard)/deal/[id]/page.tsx",
    ]) {
      const src = read(path);
      expect(src).toContain("cleanTitleConflicts(");
      expect(src).toContain("TITLE_UNCONFIRMED_LABEL");
    }
  });
});
