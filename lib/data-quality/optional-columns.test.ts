import { beforeEach, describe, expect, it } from "vitest";
import {
  columnsExist,
  resetColumnProbeCache,
  stripColumns,
} from "./optional-columns";

function client(error: unknown) {
  let calls = 0;
  return {
    calls: () => calls,
    from: () => ({
      select: () => ({
        limit: async () => {
          calls++;
          return { error };
        },
      }),
    }),
  };
}

describe("columnsExist", () => {
  beforeEach(() => resetColumnProbeCache());
  it("is true when the probe succeeds and caches it", async () => {
    const c = client(null);
    expect(await columnsExist(c as any, "deals", ["a"], 0)).toBe(true);
    expect(await columnsExist(c as any, "deals", ["a"], 1000)).toBe(true);
    expect(c.calls()).toBe(1);
  });
  it("is false on a missing-column error", async () => {
    const c = client({
      code: "42703",
      message: "column deals.a does not exist",
    });
    expect(await columnsExist(c as any, "deals", ["a"], 0)).toBe(false);
  });
  it("treats other errors as present (the write path decides)", async () => {
    const c = client({ code: "57014", message: "timeout" });
    expect(await columnsExist(c as any, "deals", ["a"], 0)).toBe(true);
  });
});

describe("stripColumns", () => {
  it("removes only the named keys and never mutates", () => {
    const rows = [{ a: 1, b: 2 }];
    expect(stripColumns(rows, ["b"])).toEqual([{ a: 1 }]);
    expect(rows[0].b).toBe(2);
  });
});
