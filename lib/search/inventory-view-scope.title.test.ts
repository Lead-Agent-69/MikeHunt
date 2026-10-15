import { describe, expect, it, vi } from "vitest";
import {
  applyInventoryViewScope,
  inventoryViewParams,
} from "./inventory-view-scope";

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
    "neq",
  ])
    b[m] = vi.fn(() => b);
  return b;
}
const titleOr = (q: any) =>
  q.or.mock.calls
    .map((c: unknown[]) => String(c[0]))
    .filter((f: string) => f.startsWith("condition."));

describe("applyInventoryViewScope titleType (feed + map)", () => {
  it("preserves repair eligibility when switching inventory views", () => {
    const params = inventoryViewParams(
      new URLSearchParams({
        states: "MO,TX",
        includeRepairable: "0",
        page: "4",
      }),
    );
    expect(params.get("includeRepairable")).toBe("0");
    expect(params.get("states")).toBe("MO,TX");
    expect(params.has("page")).toBe(false);
  });

  it("screens seller-reported repairs before map and feed pagination", () => {
    const q = query();
    applyInventoryViewScope(q, new URLSearchParams({ includeRepairable: "0" }));
    expect(q.or).toHaveBeenCalledWith(
      expect.stringContaining("title.is.null,title.not.imatch."),
    );
  });

  it("keeps explicitly requested repairable inventory eligible", () => {
    const q = query();
    applyInventoryViewScope(q, new URLSearchParams({ includeRepairable: "1" }));
    expect(q.or).not.toHaveBeenCalledWith(
      expect.stringContaining("title.not.imatch."),
    );
  });

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
