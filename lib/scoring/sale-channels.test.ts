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
//
// Handled: the CHECK body is read with balanced parentheses, so `... IN (...) OR sale_channel IS NULL`
// in any order works; quoted constraint names ("sold_listings_sale_channel_check"); NOT VALID (a
// finding unless the same file VALIDATEs it); a DROP with no re-add in the same file (a finding).
// Known misses (static text only; 412000's DB self-check backs these up on hosted):
//   * dynamic SQL (EXECUTE / format() inside DO blocks) and psql \i includes;
//   * RENAME CONSTRAINT, ALTER TABLE ... RENAME, or a CHECK declared inline in CREATE TABLE;
//   * a CHECK written without quoted literals (e.g. sale_channel = ANY (some_function()));
//   * a value list built from a domain or enum type instead of a CHECK.
const DIR = "supabase/migrations";
const strip = (s: string) => s.replace(/--[^\n]*/g, "");
const NAME = String.raw`(?:"sold_listings_sale_channel_check"|sold_listings_sale_channel_check)`;

export type SaleChannelEvent = {
  name: string;
  kind: "add" | "drop-only";
  values: string[];
  notValid: boolean;
};

/** Text inside the parenthesis that opens at s[open] (balanced, ignoring parens in '...' literals). */
function balanced(s: string, open: number): string | null {
  let depth = 0;
  let inStr = false;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "'" && s[i + 1] === "'") i++;
      else if (c === "'") inStr = false;
      continue;
    }
    if (c === "'") inStr = true;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return s.slice(open + 1, i);
  }
  return null;
}

export function saleChannelDefinitions(
  files: Array<{ name: string; body: string }>,
): SaleChannelEvent[] {
  const out: SaleChannelEvent[] = [];
  for (const { name, body } of files) {
    const src = strip(body);
    const re = new RegExp(
      String.raw`\b(DROP|ADD)\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?${NAME}`,
      "gi",
    );
    let pendingDrop = false;
    for (const m of Array.from(src.matchAll(re))) {
      if (m[1].toUpperCase() === "DROP") {
        pendingDrop = true;
        continue;
      }
      pendingDrop = false;
      const after = src.slice((m.index ?? 0) + m[0].length);
      const ck = after.match(/^\s*CHECK\s*\(/i);
      if (!ck) continue;
      const open = (m.index ?? 0) + m[0].length + ck[0].length - 1;
      const inner = balanced(src, open) ?? "";
      const tail = src.slice(open + inner.length + 2);
      const notValid =
        /^\s*NOT\s+VALID\b/i.test(tail) &&
        !new RegExp(String.raw`VALIDATE\s+CONSTRAINT\s+${NAME}`, "i").test(src);
      out.push({
        name,
        kind: "add",
        values: Array.from(
          new Set(Array.from(inner.matchAll(/'([^']+)'/g)).map((x) => x[1])),
        ).sort(),
        notValid,
      });
    }
    if (pendingDrop)
      out.push({ name, kind: "drop-only", values: [], notValid: false });
  }
  return out;
}

export function auditSaleChannels(
  events: SaleChannelEvent[],
  constant: readonly string[],
  narrowOk: Record<string, string>,
): string[] {
  const bad: string[] = [];
  for (const e of events) {
    if (e.kind === "drop-only")
      bad.push(
        `${e.name} drops sold_listings_sale_channel_check without re-adding it`,
      );
    if (e.notValid)
      bad.push(`${e.name} adds sold_listings_sale_channel_check NOT VALID`);
  }
  const defs = events.filter((e) => e.kind === "add");
  if (!defs.length)
    return [...bad, "no migration defines sold_listings_sale_channel_check"];
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

const mig = (name: string, body: string) => ({ name, body });
const GOV_SQL = GOV_SALE_CHANNELS.map((c) => `'${c}'`).join(", ");

describe("sold_listings.sale_channel has one list", () => {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, body: readFileSync(`${DIR}/${name}`, "utf8") }));
  const events = saleChannelDefinitions(files);

  it("the repo's migrations agree with SOLD_SALE_CHANNELS and never narrow", () => {
    expect(events.map((d) => d.name)).toContain(
      "20261010410000_sold_listings_open_gov_comps.sql",
    );
    expect(
      auditSaleChannels(
        events,
        SOLD_SALE_CHANNELS,
        NARROW_SALE_CHANNEL_MIGRATIONS,
      ),
    ).toEqual([]);
    for (const g of GOV_SALE_CHANNELS) expect(SOLD_SALE_CHANNELS).toContain(g);
  });

  it("planted: a later migration adding a channel (zz_test) without updating the constant fails", () => {
    const planted = [
      ...events,
      ...saleChannelDefinitions([
        mig(
          "20991231000000_zz.sql",
          `ALTER TABLE public.sold_listings DROP CONSTRAINT IF EXISTS sold_listings_sale_channel_check, ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IS NULL OR sale_channel IN (${[...SOLD_SALE_CHANNELS].map((c) => `'${c}'`).join(", ")}, 'zz_test'));`,
        ),
      ]),
    ];
    const narrow = {
      ...NARROW_SALE_CHANNEL_MIGRATIONS,
      ...Object.fromEntries(events.map((e) => [e.name, "test"])),
    };
    expect(
      auditSaleChannels(planted, SOLD_SALE_CHANNELS, narrow).join("\n"),
    ).toMatch(/latest definition 20991231000000_zz\.sql/);
    expect(
      auditSaleChannels(planted, [...SOLD_SALE_CHANNELS, "zz_test"], narrow),
    ).toEqual([]);
  });

  it("planted: OR sale_channel IS NULL written last, quoted name, odd spacing", () => {
    const [e] = saleChannelDefinitions([
      mig(
        "a.sql",
        `ALTER TABLE x ADD CONSTRAINT "sold_listings_sale_channel_check"\n  CHECK ( sale_channel IN (${GOV_SQL}) OR sale_channel IS NULL ) ;`,
      ),
    ]);
    expect(e).toMatchObject({ kind: "add", notValid: false });
    expect(e.values).toEqual([...GOV_SALE_CHANNELS].sort());
  });

  it("planted: NOT VALID is a finding unless the same file validates it", () => {
    const nv = saleChannelDefinitions([
      mig(
        "a.sql",
        `ALTER TABLE x ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IN (${GOV_SQL})) NOT VALID;`,
      ),
    ]);
    expect(auditSaleChannels(nv, GOV_SALE_CHANNELS, {}).join("\n")).toMatch(
      /NOT VALID/,
    );
    const ok = saleChannelDefinitions([
      mig(
        "a.sql",
        `ALTER TABLE x ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IN (${GOV_SQL})) NOT VALID;\nALTER TABLE x VALIDATE CONSTRAINT sold_listings_sale_channel_check;`,
      ),
    ]);
    expect(auditSaleChannels(ok, GOV_SALE_CHANNELS, {})).toEqual([]);
  });

  it("planted: a drop with no re-add is a finding", () => {
    const ev = saleChannelDefinitions([
      mig(
        "a.sql",
        `ALTER TABLE x ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IN (${GOV_SQL}));`,
      ),
      mig(
        "b.sql",
        `ALTER TABLE x DROP CONSTRAINT IF EXISTS "sold_listings_sale_channel_check";`,
      ),
    ]);
    expect(auditSaleChannels(ev, GOV_SALE_CHANNELS, {}).join("\n")).toMatch(
      /b\.sql drops sold_listings_sale_channel_check without re-adding it/,
    );
  });

  it("planted: a later migration that drops a channel fails", () => {
    const ev = saleChannelDefinitions([
      mig(
        "a.sql",
        `ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IN (${GOV_SQL}));`,
      ),
      mig(
        "b.sql",
        `ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IN ('gov_fleet_auction', 'gov_impound_auction'));`,
      ),
    ]);
    expect(
      auditSaleChannels(
        ev,
        ["gov_fleet_auction", "gov_impound_auction"],
        {},
      ).join("\n"),
    ).toMatch(/drops \[gov_surplus_auction\]/);
  });

  it("planted: a narrower earlier definition needs a documented re-run rule", () => {
    const ev = saleChannelDefinitions([
      mig(
        "a.sql",
        `ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IN ('gov_fleet_auction'));`,
      ),
      mig(
        "b.sql",
        `ADD CONSTRAINT sold_listings_sale_channel_check CHECK (sale_channel IN ('zz_test', 'gov_fleet_auction'));`,
      ),
    ]);
    expect(
      auditSaleChannels(ev, ["zz_test", "gov_fleet_auction"], {}).join("\n"),
    ).toMatch(/a\.sql lacks \[zz_test\]/);
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
