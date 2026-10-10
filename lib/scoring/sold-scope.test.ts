import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyRetailSoldScope,
  GOV_SALE_CHANNELS,
  isMissingSaleChannelColumn,
  isRetailSoldRow,
  withRetailSold,
} from "./sold-scope";

function fakeQuery() {
  const calls: Array<[string, ...unknown[]]> = [];
  const q: any = {
    eq: (...a: unknown[]) => (calls.push(["eq", ...a]), q),
    is: (...a: unknown[]) => (calls.push(["is", ...a]), q),
    or: (...a: unknown[]) => (calls.push(["or", ...a]), q),
  };
  return { q, calls };
}

describe("retail sold scope", () => {
  it("retail = basis 'sold' AND (sale_channel IS NULL OR 'ebay')", () => {
    const { q, calls } = fakeQuery();
    applyRetailSoldScope(q, { basis: true, retailOnly: true });
    expect(calls).toEqual([
      ["eq", "basis", "sold"],
      ["or", "sale_channel.is.null,sale_channel.eq.ebay"],
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

  it("gov lane channels are exactly the gov allow-list (no ebay)", () => {
    expect([...GOV_SALE_CHANNELS].sort()).toEqual([
      "gov_fleet_auction",
      "gov_impound_auction",
      "gov_surplus_auction",
    ]);
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
    expect(isRetailSoldRow({ basis: "sold", sale_channel: "ebay" })).toBe(true);
    expect(isRetailSoldRow({ basis: "removed", sale_channel: "ebay" })).toBe(
      false,
    );
  });
});

// Ren #302 guard: every code path that reads sold_listings either uses the retail scope
// (basis 'sold' + sale_channel IS NULL) or is a separate gov lane that selects attribution and
// returns it with each row.
// Known misses (static text matching cannot see them; review and the DB lane constraints cover them):
//   * Default parameters: function q(t = "sold_listings") { return sb.from(t) } binds the table in a
//     parameter default, which isn't a const/let/var/property binding.
//   * Casts and indirection: sb.from(("sold_listings" as any)), sb.from(T as any), (sb as any)["from"](T),
//     or a table name passed in as an argument from another module.
//   * String building: sb.from("sold_" + "listings"), template interpolation (`sold_${x}`), join(),
//     or any name computed at run time.
//   * Readers outside app/, lib/, scripts/, workers/ (e.g. supabase/functions) and raw SQL/RPC reads.
// Every .from(...) whose argument resolves to sold_listings: the literal in any quote style, or an
// identifier bound anywhere in the scanned tree to the string "sold_listings" (const TABLE = ...,
// exported/imported constants, `as const`), so a renamed constant can't hide a reader.
const SCAN =
  "git ls-files -- 'app/**/*.ts' 'app/**/*.tsx' 'lib/**/*.ts' 'lib/**/*.tsx' 'scripts/**/*.ts' 'workers/**/*.ts' ':!*.test.ts' ':!*.test.tsx'";
const TABLE_LITERAL = `(?:"sold_listings"|'sold_listings'|\`sold_listings\`)`;

export function soldTableIdentifiers(sources: string[]): Set<string> {
  const ids = new Set<string>();
  const bind = new RegExp(
    String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=]+)?=\s*${TABLE_LITERAL}`,
    "g",
  );
  const prop = new RegExp(
    String.raw`\b([A-Za-z_$][\w$]*)\s*:\s*${TABLE_LITERAL}`,
    "g",
  );
  for (const src of sources) {
    for (const m of Array.from(src.matchAll(bind))) ids.add(m[1]);
    for (const m of Array.from(src.matchAll(prop))) ids.add(m[1]);
  }
  return ids;
}

export function soldFromSites(src: string, ids: Set<string>): number[] {
  const alts = [
    TABLE_LITERAL,
    ...Array.from(ids).map(
      (i) => String.raw`(?:[\w$]+\.)?${i.replace(/\$/g, "\\$")}\b`,
    ),
  ];
  const re = new RegExp(String.raw`\.from\(\s*(?:${alts.join("|")})\s*\)`, "g");
  return Array.from(src.matchAll(re)).map((m) => (m.index ?? 0) + m[0].length);
}

export function checkSoldReads(src: string, ids: Set<string>): string[] {
  const bad: string[] = [];
  for (const end of soldFromSites(src, ids)) {
    const after = src.slice(end);
    const nextFrom = after.indexOf(".from(");
    const chain = after.slice(0, nextFrom < 0 ? 900 : Math.min(nextFrom, 900));
    const start = src.lastIndexOf(".from(", end - 1);
    const before = src.slice(Math.max(0, start - 240), start);
    if (/^\s*\.(insert|upsert)\(/.test(chain)) continue;
    const retail = /applyRetailSoldScope\(\s*\w+\s*$/.test(before);
    const select = chain.match(/\.select\(\s*(["'`])([\s\S]*?)\1/);
    const govLane =
      // Gov lane = explicit allow-list (Ren #320): eBay and unknown channels can never land there.
      /\.in\(\s*"sale_channel",\s*\[\.\.\.GOV_SALE_CHANNELS\]\s*\)/.test(
        chain,
      ) &&
      !!select &&
      /\battribution\b/.test(select[2]) &&
      /\battribution:\s*d\.attribution\b/.test(src);
    if (!retail && !govLane) bad.push(`@${start}`);
  }
  return bad;
}

describe("every sold_listings reader keeps gov rows out of retail comps", () => {
  const all = execSync(SCAN, { encoding: "utf8" }).split("\n").filter(Boolean);
  const srcs = new Map(all.map((f) => [f, readFileSync(f, "utf8")]));
  const ids = soldTableIdentifiers(Array.from(srcs.values()));
  const files = all.filter((f) => soldFromSites(srcs.get(f)!, ids).length > 0);

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
      expect(
        checkSoldReads(srcs.get(file)!, ids),
        `${file}: sold_listings read must use applyRetailSoldScope or be an attributed gov lane`,
      ).toEqual([]);
    });
  }

  it("catches .from(CONST), .from(mod.CONST) and other quote styles (planted)", () => {
    const planted = [
      'const T = "sold_listings";\nsb.from(T).select("sold_price");',
      "export const SOLD_TABLE = 'sold_listings' as const;\nsb.from(SOLD_TABLE).select('x');",
      'const tables = { sold: "sold_listings" };\nsb.from(tables.sold).select("x");',
      "sb.from(`sold_listings`).select('x');",
    ];
    for (const src of planted) {
      const i = soldTableIdentifiers([src]);
      expect(soldFromSites(src, i).length, src).toBe(1);
      expect(checkSoldReads(src, i), src).toHaveLength(1);
    }
    // ... and still accepts the scoped form and writers.
    const ok =
      'const T = "sold_listings";\napplyRetailSoldScope(\n  sb\n    .from(T).select("x"), s);\nsb.from(T).upsert(rows);';
    expect(checkSoldReads(ok, soldTableIdentifiers([ok]))).toEqual([]);
  });
});
