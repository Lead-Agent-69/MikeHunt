import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_SAVED_SEARCHES_PER_USER,
  capSearchesPerUser,
  rowsOwnedBySearchUser,
} from "./saved-search-limits";

// Ren (live on hosted PG17): a signed-in client could set notify_sms=true, last_run_at=2099 and a
// 100k-character name on its own saved searches, and write its own alert inbox rows.
// 20261010151000 makes both tables column-/command-limited for clients; these guards keep it so.
const NAME = "20261010151000_saved_search_grants_bounds.sql";
const DIR = "supabase/migrations";
const strip = (s: string) => s.replace(/--[^\n]*/g, "");
const sql = strip(readFileSync(`${DIR}/${NAME}`, "utf8"));
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();
const later = files.filter((f) => f > NAME);
const read = (f: string) => strip(readFileSync(`${DIR}/${f}`, "utf8"));

const EDITABLE = [
  "user_id",
  "name",
  "make",
  "model",
  "state",
  "lane",
  "seller_type",
  "title_type",
  "min_year",
  "max_year",
  "max_price",
  "target_profit",
  "max_distance_miles",
  "min_count",
  "match_precision",
  "delivery_mode",
  "notify_email",
  "is_active",
  "require_go",
];
const SERVER_ONLY = [
  "id",
  "notify_sms",
  "last_run_at",
  "created_at",
  "digest_sent_at",
];
const TABLES = String.raw`("?public"?\s*\.\s*)?"?(user_saved_searches|user_feed_inbox)"?(?![\w$])`;
const CLIENT = String.raw`\b(anon|authenticated|PUBLIC)\b`;

describe("20261010151000 saved-search grants + bounds", () => {
  it("sorts after the #339 scope columns and before every other saved-search migration", () => {
    expect(files).toContain("20261010150000_saved_search_scope_columns.sql");
    expect(NAME > "20261010150000_saved_search_scope_columns.sql").toBe(true);
    // #317 (saved_search_tuning) must be renumbered after this file.
    for (const f of files.filter((x) => /saved_search_tuning/.test(x))) {
      expect(f > NAME, `${f} must sort after ${NAME}`).toBe(true);
    }
  });

  it("revokes everything from anon/PUBLIC/authenticated, then re-grants only SELECT(+DELETE)", () => {
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.user_saved_searches\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+TABLE\s+public\.user_feed_inbox\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    );
    expect(sql).toMatch(
      /GRANT\s+SELECT\s+ON\s+TABLE\s+public\.user_feed_inbox\s+TO\s+authenticated\s*;/i,
    );
    expect(sql).toMatch(
      /GRANT\s+SELECT,\s*DELETE\s+ON\s+TABLE\s+public\.user_saved_searches\s+TO\s+authenticated\s*;/i,
    );
    expect(sql).not.toMatch(
      new RegExp(String.raw`GRANT[^;]*\bTO\b[^;]*\b(anon|PUBLIC)\b`, "i"),
    );
  });

  it("column grant list is exactly the editable set and never a server-only column", () => {
    const lists = Array.from(
      sql.matchAll(/editable\s+text\[\]\s*:=\s*ARRAY\[([^\]]*)\]/gi),
    ).map((m) => Array.from(m[1].matchAll(/'([a-z_]+)'/g)).map((x) => x[1]));
    expect(lists.length).toBe(2); // grant block + self-check block
    for (const l of lists) {
      expect([...l].sort()).toEqual([...EDITABLE].sort());
      for (const c of SERVER_ONLY) expect(l).not.toContain(c);
    }
    expect(sql).toMatch(
      /server_only\s+text\[\]\s*:=\s*ARRAY\['id',\s*'notify_sms',\s*'last_run_at',\s*'created_at'\]/,
    );
  });

  it("adds the CHECK bounds NOT VALID and validates each one", () => {
    const bounds: Array<[string, RegExp]> = [
      ["name_len", /char_length\(name\)\s+BETWEEN\s+1\s+AND\s+120/i],
      [
        "text_len",
        /char_length\(make\)\s*<=\s*64\s+AND\s+char_length\(model\)\s*<=\s*64/i,
      ],
      [
        "year_range",
        /min_year\s+BETWEEN\s+1900\s+AND\s+2100\s+AND\s+max_year\s+BETWEEN\s+1900\s+AND\s+2100\s+AND\s+min_year\s*<=\s*max_year/i,
      ],
      ["price_range", /max_price\s+BETWEEN\s+0\s+AND\s+10000000/i],
      ["profit_range", /target_profit\s+BETWEEN\s+-1000000\s+AND\s+1000000/i],
      ["distance_range", /max_distance_miles\s+BETWEEN\s+0\s+AND\s+3000/i],
      ["min_count_range", /min_count\s+BETWEEN\s+1\s+AND\s+50/i],
    ];
    for (const [name, re] of bounds) {
      expect(sql).toMatch(re);
      expect(sql).toMatch(
        new RegExp(
          String.raw`ADD\s+CONSTRAINT\s+user_saved_searches_${name}\b[^;]*?NOT\s+VALID`,
          "i",
        ),
      );
      expect(sql).toMatch(
        new RegExp(
          String.raw`VALIDATE\s+CONSTRAINT\s+user_saved_searches_${name}\s*;`,
          "i",
        ),
      );
    }
  });

  it("guard trigger: year <= now()+2 and 50 per user under an advisory lock", () => {
    expect(MAX_SAVED_SEARCHES_PER_USER).toBe(50);
    expect(sql).toMatch(/extract\(year\s+FROM\s+now\(\)\)::integer\s*\+\s*2/i);
    expect(sql).toMatch(/IF\s+n\s*>=\s*50\s+THEN/i);
    expect(sql).toMatch(/pg_advisory_xact_lock/);
    expect(sql).toMatch(/SECURITY\s+DEFINER\s+SET\s+search_path\s*=\s*''/i);
    expect(sql).toMatch(
      /BEFORE\s+INSERT\s+OR\s+UPDATE\s+ON\s+public\.user_saved_searches\s+FOR\s+EACH\s+ROW/i,
    );
    expect(sql).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.user_saved_searches_guard\(\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i,
    );
  });

  it("later migrations do not re-open table-wide writes or server-only columns to clients", () => {
    for (const f of later) {
      const body = read(f);
      for (const m of Array.from(
        body.matchAll(
          /GRANT\s+([^;]*?)\bON\s+(TABLE\s+)?([^;]*?)\bTO\b([^;]*);/gi,
        ),
      )) {
        const [, privs, , objs, to] = m;
        if (
          !new RegExp(TABLES, "i").test(objs) ||
          !new RegExp(CLIENT, "i").test(to)
        )
          continue;
        expect(
          /\banon\b|\bPUBLIC\b/i.test(to),
          `${f}: grants on saved-search tables to anon/PUBLIC`,
        ).toBe(false);
        // Table-wide INSERT/UPDATE/ALL (no column list) is forbidden; column lists must avoid server-only.
        const tableWide =
          /\b(ALL|INSERT|UPDATE|TRUNCATE|TRIGGER|REFERENCES)\b(?!\s*\()/i.test(
            privs,
          );
        expect(
          tableWide,
          `${f}: table-wide write grant on saved-search tables`,
        ).toBe(false);
        if (/user_feed_inbox/i.test(objs)) {
          expect(
            /\b(INSERT|UPDATE|DELETE)\b/i.test(privs),
            `${f}: user_feed_inbox must stay SELECT-only`,
          ).toBe(false);
        }
        for (const c of SERVER_ONLY) {
          expect(
            new RegExp(String.raw`\(\s*[^)]*\b${c}\b[^)]*\)`, "i").test(privs),
            `${f}: grants server-only ${c}`,
          ).toBe(false);
        }
      }
    }
  });

  it("#317's precision/delivery columns are granted when they are added after this file", () => {
    for (const f of later) {
      const body = read(f);
      if (!/ADD\s+COLUMN[^;]*\b(match_precision|delivery_mode)\b/i.test(body))
        continue;
      for (const c of ["match_precision", "delivery_mode"]) {
        expect(
          new RegExp(
            String.raw`GRANT\s+INSERT\s*\([^)]*\b${c}\b[^)]*\)\s*,\s*UPDATE\s*\([^)]*\b${c}\b[^)]*\)\s+ON\s+(TABLE\s+)?public\.user_saved_searches\s+TO\s+authenticated`,
            "i",
          ).test(body),
          `${f} adds ${c} but does not grant INSERT/UPDATE (${c}) to authenticated`,
        ).toBe(true);
      }
    }
  });
});

describe("client writes and server fan-out", () => {
  it("/searches never sends server-only columns", () => {
    const page = readFileSync("app/(dashboard)/searches/page.tsx", "utf8");
    const code = page.replace(/\/\/[^\n]*/g, "");
    for (const c of [
      "notify_sms",
      "last_run_at",
      "created_at",
      "digest_sent_at",
    ]) {
      expect(code, `/searches sends ${c}`).not.toMatch(
        new RegExp(String.raw`\b${c}\s*:`),
      );
    }
  });

  it("pipeline orders saved searches and caps them per user", () => {
    const src = readFileSync("lib/scrapers/pipeline.ts", "utf8");
    expect(src).toMatch(
      /\.order\(SAVED_SEARCH_ORDER\[0\]\)\s*\.order\(SAVED_SEARCH_ORDER\[1\]\)\s*\.order\(SAVED_SEARCH_ORDER\[2\]\)/,
    );
    expect(src).toMatch(/capSearchesPerUser\(/);
  });

  it("the #317 digest (when present) uses the same order, cap and owner check", () => {
    const f = "lib/alerts/saved-search-digest.ts";
    if (!existsSync(f)) return;
    const src = readFileSync(f, "utf8");
    expect(src).toMatch(/SAVED_SEARCH_ORDER/);
    expect(src).toMatch(/capSearchesPerUser\(/);
    expect(src).toMatch(/rowsOwnedBySearchUser\(/);
  });

  it("capSearchesPerUser keeps the oldest 50 per user, deterministically", () => {
    const rows = [
      ...Array.from({ length: 60 }, (_, i) => ({
        id: `a${String(i).padStart(2, "0")}`,
        user_id: "u1",
        created_at: `2026-01-01T00:00:${String(59 - i).padStart(2, "0")}Z`,
      })),
      { id: "b1", user_id: "u2", created_at: "2026-01-01T00:00:00Z" },
    ];
    const out = capSearchesPerUser(rows);
    expect(out.filter((r) => r.user_id === "u1")).toHaveLength(50);
    expect(out.filter((r) => r.user_id === "u2")).toHaveLength(1);
    // oldest first: a59 has the earliest created_at
    expect(out[0].id).toBe("a59");
    expect(out.map((r) => r.id)).not.toContain("a00");
    expect(capSearchesPerUser([...rows].reverse())).toEqual(out);
  });

  it("rowsOwnedBySearchUser drops rows pointing at another user's (or no) search", () => {
    const searches = [
      { id: "s1", user_id: "u1" },
      { id: "s2", user_id: "u2" },
    ];
    const rows = [
      { id: "r1", user_id: "u1", search_id: "s1" },
      { id: "r2", user_id: "u1", search_id: "s2" },
      { id: "r3", user_id: "u1", search_id: null },
      { id: "r4", user_id: "u1", search_id: "missing" },
    ];
    expect(rowsOwnedBySearchUser(rows, searches).map((r) => r.id)).toEqual([
      "r1",
    ]);
  });
});
