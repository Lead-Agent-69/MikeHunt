import { describe, expect, it, vi } from "vitest";
import { applyInventoryViewScope } from "./inventory-view-scope";

function query() {
  const b: any = {};
  for (const m of [
    "eq",
    "in",
    "or",
    "ilike",
    "is",
    "gt",
    "gte",
    "lte",
    "lt",
    "not",
  ])
    b[m] = vi.fn(() => b);
  return b;
}
const titleOr = (q: any) =>
  q.or.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((f: string) => f.startsWith("condition."));

describe("applyInventoryViewScope titleType (feed + map)", () => {
  it.each([
    ["clean", "condition.in.(clean_title)"],
    ["rebuilt", "condition.in.(rebuilt_title)"],
    ["salvage", "condition.in.(parts_only,salvage_title)"],
    ["rebuildable", "condition.in.(repairable)"],
    ["unknown", "condition.in.(run_drive,flood,fire,hail),condition.is.null"],
    [
      "salvage,rebuildable",
      "condition.in.(repairable,parts_only,salvage_title)",
    ],
    [
      "clean,unknown",
      "condition.in.(run_drive,clean_title,flood,fire,hail),condition.is.null",
    ],
  ])("titleType=%s", (titleType, expected) => {
    const q = query();
    applyInventoryViewScope(q, new URLSearchParams({ titleType }));
    expect(titleOr(q)).toEqual([expected]);
    expect(q.eq).not.toHaveBeenCalledWith("condition", expect.anything());
  });

  it("all / empty / junk → no title filter", () => {
    for (const titleType of ["all", "", "clean carfax"]) {
      const q = query();
      applyInventoryViewScope(q, new URLSearchParams({ titleType }));
      expect(titleOr(q)).toEqual([]);
      expect(q.eq).not.toHaveBeenCalledWith("condition", expect.anything());
    }
  });
});
