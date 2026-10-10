import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GOV_SALE_CHANNELS,
  NARROW_SALE_CHANNEL_MIGRATIONS,
  SOLD_SALE_CHANNELS,
} from "./sale-channels";

// One sale_channel list shared by every migration that (re)defines sold_listings_sale_channel_check
// and every TypeScript writer (Ren #324 hazard: #316's 410000 vs #320's 500000 'ebay').
const DIR = "supabase/migrations";
const strip = (s: string) => s.replace(/--[^\n]*/g, "");

export function saleChannelDefinitions(
  files: Array<{ name: string; body: string }>,
) {
  const out: Array<{ name: string; values: string[] }> = [];
  for (const { name, body } of files) {
    const re =
      /ADD\s+CONSTRAINT\s+sold_listings_sale_channel_check\s+CHECK\s*\(([\s\S]*?)\)\s*\)\s*[,;]/gi;
    for (const m of Array.from(strip(body).matchAll(re)))
      out.push({
        name,
        values: Array.from(m[1].matchAll(/'([a-z_]+)'/g))
          .map((x) => x[1])
          .sort(),
      });
  }
  return out;
}

export function auditSaleChannels(
  defs: Array<{ name: string; values: string[] }>,
  constant: readonly string[],
  narrowOk: Record<string, string>,
): string[] {
  const bad: string[] = [];
  if (!defs.length)
    return ["no migration defines sold_listings_sale_channel_check"];
  const final = defs[defs.length - 1];
  const want = [...constant].sort();
  if (JSON.stringify(final.values) !== JSON.stringify(want))
    bad.push(
      `latest definition ${final.name} lists [${final.values}] but SOLD_SALE_CHANNELS is [${want}]`,
    );
  for (let i = 0; i < defs.length; i++)
    for (let j = i + 1; j < defs.length; j++) {
      const lost = defs[i].values.filter((v) => !defs[j].values.includes(v));
      if (lost.length)
        bad.push(
          `${defs[j].name} drops [${lost}] that ${defs[i].name} allowed`,
        );
    }
  for (const d of defs.slice(0, -1)) {
    const missing = final.values.filter((v) => !d.values.includes(v));
    if (missing.length && !narrowOk[d.name])
      bad.push(
        `${d.name} lacks [${missing}] from the latest list; add it to NARROW_SALE_CHANNEL_MIGRATIONS with its re-run rule`,
      );
  }
  return bad;
}

describe("sold_listings.sale_channel has one list", () => {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, body: readFileSync(`${DIR}/${name}`, "utf8") }));
  const defs = saleChannelDefinitions(files);

  it("the repo's migrations agree with SOLD_SALE_CHANNELS and never narrow", () => {
    expect(defs.map((d) => d.name)).toContain(
      "20261010410000_sold_listings_open_gov_comps.sql",
    );
    expect(
      auditSaleChannels(
        defs,
        SOLD_SALE_CHANNELS,
        NARROW_SALE_CHANNEL_MIGRATIONS,
      ),
    ).toEqual([]);
    for (const g of GOV_SALE_CHANNELS) expect(SOLD_SALE_CHANNELS).toContain(g);
    expect(SOLD_SALE_CHANNELS).toContain("ebay");
    // 500000 (#320) is the latest definer and lists exactly the constant.
    expect(defs[defs.length - 1].name).toBe(
      "20261010500000_sold_listings_ebay_detail.sql",
    );
  });

  it("planted: a later migration adding a channel without updating the constant fails", () => {
    const planted = [
      ...defs,
      {
        name: "20261010900000_x.sql",
        values: [...SOLD_SALE_CHANNELS, "new_lane"].sort(),
      },
    ];
    expect(
      auditSaleChannels(
        planted,
        SOLD_SALE_CHANNELS,
        NARROW_SALE_CHANNEL_MIGRATIONS,
      ).join("\n"),
    ).toMatch(/latest definition 20261010900000_x\.sql/);
    // ... and passes once the constant carries it (410000 and 500000 are on the narrow list with their re-run rule).
    expect(
      auditSaleChannels(planted, [...SOLD_SALE_CHANNELS, "new_lane"], {
        ...NARROW_SALE_CHANNEL_MIGRATIONS,
        "20261010500000_sold_listings_ebay_detail.sql":
          "planted: re-run the new definer after it",
      }),
    ).toEqual([]);
  });

  it("planted: a later migration that drops a channel fails", () => {
    const planted = [
      ...defs,
      {
        name: "20261010600000_y.sql",
        values: ["gov_fleet_auction", "gov_impound_auction"],
      },
    ];
    expect(
      auditSaleChannels(
        planted,
        ["gov_fleet_auction", "gov_impound_auction"],
        {},
      ).join("\n"),
    ).toMatch(/drops \[gov_surplus_auction\]/);
  });

  it("planted: a narrower earlier definition needs a documented re-run rule", () => {
    const planted = [
      { name: "a.sql", values: ["gov_fleet_auction"] },
      { name: "b.sql", values: ["ebay", "gov_fleet_auction"] },
    ];
    expect(
      auditSaleChannels(planted, ["ebay", "gov_fleet_auction"], {}).join("\n"),
    ).toMatch(/a\.sql lacks \[ebay\]/);
  });

  it("every sale_channel literal a writer sets is in SOLD_SALE_CHANNELS", () => {
    const writers = execSync(
      "git ls-files -- 'app/**/*.ts' 'lib/**/*.ts' 'scripts/**/*.ts' ':!*.test.ts'",
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean);
    const seen = new Set<string>();
    for (const f of writers)
      for (const m of Array.from(
        readFileSync(f, "utf8").matchAll(/sale_channel:\s*["']([a-z_]+)["']/g),
      ))
        seen.add(m[1]);
    expect(seen.size).toBeGreaterThan(0);
    for (const v of Array.from(seen))
      expect(SOLD_SALE_CHANNELS, v).toContain(v);
  });
});
