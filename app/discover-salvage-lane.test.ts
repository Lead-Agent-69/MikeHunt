import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  hiddenRailKeysForMode,
  SALVAGE_REBUILDABLE_RAIL,
} from "@/lib/discovery/desk-rails";

const read = (path: string) => readFileSync(path, "utf8");

describe("Discover Salvage & Rebuildable lane", () => {
  it("personal sees it only after opting in; parts/flip always", () => {
    expect(
      hiddenRailKeysForMode("personal").has(SALVAGE_REBUILDABLE_RAIL),
    ).toBe(true);
    expect(
      hiddenRailKeysForMode("personal", { includeRepairable: true }).has(
        SALVAGE_REBUILDABLE_RAIL,
      ),
    ).toBe(false);
    expect(hiddenRailKeysForMode("parts").has(SALVAGE_REBUILDABLE_RAIL)).toBe(
      false,
    );
    expect(hiddenRailKeysForMode("dealer").has(SALVAGE_REBUILDABLE_RAIL)).toBe(
      false,
    );
  });

  it("the page passes the saved opt-in to the rail gate", () => {
    const page = read("app/(dashboard)/discover/page.tsx");
    expect(page).toMatch(
      /hiddenRailKeysForMode\(buyerScope\?\.buyerMode, \{\s*includeRepairable: buyerScope\?\.includeRepairable,\s*\}\)/,
    );
  });

  it("lane copy is research-only, with no profit claim", () => {
    const page = read("app/(dashboard)/discover/page.tsx");
    const subtitle =
      page.match(/SALVAGE_LANE_SUBTITLE =\s*"([^"]+)"/)?.[1] || "";
    expect(subtitle).toMatch(/research/i);
    expect(subtitle).not.toMatch(/profit|flip|\$/i);
  });

  it("Settings explains the opt-in toggle turns the lane on", () => {
    const settings = read("app/(dashboard)/settings/page.tsx");
    expect(settings).toContain("includeRepairable: enabled");
    expect(settings).toContain("Rebuildable lane on Discover");
  });
});
