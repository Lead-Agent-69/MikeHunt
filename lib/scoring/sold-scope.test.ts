import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRetailSoldScope,
  isMissingSaleChannelColumn,
  isRetailSoldRow,
  withRetailSold,
} from "./sold-scope";

function fakeQuery() {
  const calls: Array<[string, ...unknown[]]> = [];
  const q: any = {
    eq: (...a: unknown[]) => (calls.push(["eq", ...a]), q),
    is: (...a: unknown[]) => (calls.push(["is", ...a]), q),
  };
  return { q, calls };
}

describe("retail sold scope", () => {
  it("retail = basis 'sold' AND sale_channel IS NULL", () => {
    const { q, calls } = fakeQuery();
    applyRetailSoldScope(q, { basis: true, retailOnly: true });
    expect(calls).toEqual([
      ["eq", "basis", "sold"],
      ["is", "sale_channel", null],
    ]);
  });

  it("drops only the missing column's filter, in order", async () => {
    const seen: Array<{ basis: boolean; retailOnly: boolean }> = [];
    const missing = (col: string) => ({
      data: null,
      error: {
        code: "42703",
        message: `column sold_listings.${col} does not exist`,
      },
    });
    const r = await withRetailSold(async (s) => {
      seen.push({ ...s });
      if (s.retailOnly) return missing("sale_channel");
      if (s.basis) return missing("basis");
      return { data: [1], error: null };
    });
    expect(r.data).toEqual([1]);
    expect(seen).toEqual([
      { basis: true, retailOnly: true },
      { basis: true, retailOnly: false },
      { basis: false, retailOnly: false },
    ]);
  });

  it("other errors are returned untouched (no silent unfiltered retry)", async () => {
    let n = 0;
    const r = await withRetailSold(async () => {
      n++;
      return {
        data: null,
        error: { code: "57014", message: "statement timeout" },
      };
    });
    expect(n).toBe(1);
    expect(r.error?.code).toBe("57014");
    expect(
      isMissingSaleChannelColumn({
        code: "42703",
        message: "column foo does not exist",
      }),
    ).toBe(false);
  });

  it("in-memory guard: gov rows and closing bids are never retail", () => {
    expect(isRetailSoldRow({ basis: "sold", sale_channel: null })).toBe(true);
    expect(isRetailSoldRow({})).toBe(true);
    expect(
      isRetailSoldRow({ basis: "sold", sale_channel: "gov_impound_auction" }),
    ).toBe(false);
    expect(
      isRetailSoldRow({ basis: "last_bid", sale_channel: "gov_fleet_auction" }),
    ).toBe(false);
    expect(isRetailSoldRow({ basis: "removed" })).toBe(false);
  });
});

// Ren #302 guard: every code path that reads sold_listings either uses the retail scope
// (basis 'sold' + sale_channel IS NULL) or is a separate gov lane that selects attribution and
// returns it with each row.
describe("every sold_listings reader keeps gov rows out of retail comps", () => {
  const files = execSync(
    "git grep -l 'from(\"sold_listings\")' -- 'app/**/*.ts' 'app/**/*.tsx' 'lib/**/*.ts' 'scripts/**/*.ts' 'workers/**/*.ts' ':!*.test.ts'",
    { encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);

  it("finds the known readers", () => {
    for (const f of [
      "app/api/sold/route.ts",
      "app/api/market/sold/route.ts",
      "app/api/arbitrage/route.ts",
      "app/api/system/status/route.ts",
      "lib/scoring/market-value.ts",
    ])
      expect(files).toContain(f);
  });

  for (const file of files) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      const marker = '.from("sold_listings")';
      let at = src.indexOf(marker);
      expect(at).toBeGreaterThanOrEqual(0);
      while (at >= 0) {
        const after = src.slice(at + marker.length);
        const nextFrom = after.indexOf(".from(");
        const chain = after.slice(
          0,
          nextFrom < 0 ? 900 : Math.min(nextFrom, 900),
        );
        const before = src.slice(Math.max(0, at - 240), at);
        const writer = /^\s*\.(insert|upsert)\(/.test(chain);
        if (!writer) {
          const retail = /applyRetailSoldScope\(\s*\w+\s*$/.test(before);
          const select = chain.match(/\.select\(\s*(["'`])([\s\S]*?)\1/);
          const govLane =
            /\.not\(\s*"sale_channel",\s*"is",\s*null\s*\)/.test(chain) &&
            !!select &&
            /\battribution\b/.test(select[2]) &&
            /\battribution:\s*d\.attribution\b/.test(src);
          expect(
            retail || govLane,
            `${file} @${at}: sold_listings read must use applyRetailSoldScope or be an attributed gov lane`,
          ).toBe(true);
        }
        at = src.indexOf(marker, at + marker.length);
      }
    });
  }
});
