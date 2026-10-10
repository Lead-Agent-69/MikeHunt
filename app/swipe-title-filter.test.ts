import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  titleTypeFromQuery,
  withTitleType,
} from "@/lib/deals/title-filter-options";

describe("Swipe title filter -> titleType on the inventory query", () => {
  it("sets, clears, or keeps the saved scope's titleType", () => {
    expect(withTitleType("state=MO", "salvage")).toBe(
      "state=MO&titleType=salvage",
    );
    expect(withTitleType("state=MO&titleType=clean", "all")).toBe("state=MO");
    expect(withTitleType("titleType=clean", null)).toBe("titleType=clean");
    expect(withTitleType("state=MO", "Clean Carfax")).toBe("state=MO");
  });

  it("the select reads back a single bucket, else All", () => {
    expect(titleTypeFromQuery("titleType=rebuildable")).toBe("rebuildable");
    expect(titleTypeFromQuery("titleType=salvage,rebuildable")).toBe("all");
    expect(titleTypeFromQuery("")).toBe("all");
  });

  it("Swipe wires the select into the query it fetches", () => {
    const src = readFileSync("app/(dashboard)/swipe/page.tsx", "utf8");
    expect(src).toContain("withTitleType(sharedQuery, titleFilter)");
    expect(src).toContain('aria-label="Title filter"');
  });
});
