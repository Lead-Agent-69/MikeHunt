import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEALS_PUBLIC_COLUMNS,
  DEALS_SERVER_ONLY_COLUMNS,
} from "./deals-public-columns";

const MIGRATION = "supabase/migrations/20261010020000_deals_column_grants.sql";
const sql = readFileSync(MIGRATION, "utf8");

function grantedColumns(): string[] {
  const m = sql.match(
    /GRANT SELECT \(([^)]*)\) ON public\.deals TO anon, authenticated;/,
  );
  expect(m).not.toBeNull();
  return m![1]
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function guardColumns(): string[] {
  const i = sql.indexOf("c.column_name = ANY (ARRAY[");
  expect(i).toBeGreaterThan(-1);
  const end = sql.indexOf("]", i);
  return Array.from(sql.slice(i, end).matchAll(/'([a-z_]+)'/g), (m) => m[1]);
}

describe("deals column grants migration", () => {
  it("revokes table-wide SELECT from anon and authenticated, leaves service_role alone", () => {
    expect(sql).toContain(
      "REVOKE SELECT ON public.deals FROM anon, authenticated;",
    );
    expect(sql).not.toMatch(/GRANT SELECT ON public\.deals TO/i);
    expect(sql).not.toMatch(/REVOKE[^;]*service_role/i);
  });

  it("grants exactly DEALS_PUBLIC_COLUMNS (Ren's list)", () => {
    expect(grantedColumns()).toEqual([...DEALS_PUBLIC_COLUMNS]);
  });

  it("never grants a server-only column", () => {
    for (const c of DEALS_SERVER_ONLY_COLUMNS) {
      expect(DEALS_PUBLIC_COLUMNS as readonly string[]).not.toContain(c);
    }
    for (const c of [
      "embedding",
      "lat",
      "lng",
      "location",
      "location_zip",
      "pricing_breakdown",
      "options",
      "dealer_id",
      "source_deal_id",
      "duplicate_of_id",
      "duplicate_confidence",
      "flash_alert_sent",
      "images_cached",
      "kbb_trade_in",
      "kbb_retail",
      "cargurus_price",
      "mmr_value",
      "estimated_transport_cost",
      "estimated_repair_cost",
      "true_net_profit",
      "profit_score",
      "deal_analysis",
    ]) {
      expect(DEALS_SERVER_ONLY_COLUMNS as readonly string[]).toContain(c);
    }
  });

  it("guard block fails the migration if any server-only column stays selectable", () => {
    expect(guardColumns().sort()).toEqual(
      [...DEALS_SERVER_ONLY_COLUMNS].sort(),
    );
    expect(sql).toContain(
      "has_column_privilege(r.rolname, 'public.deals', c.column_name, 'SELECT')",
    );
    expect(sql).toContain("RAISE EXCEPTION");
  });

  it("revokes discover_deals and top_deals from anon / authenticated", () => {
    expect(sql).toContain(
      "REVOKE EXECUTE ON FUNCTION public.discover_deals(text, numeric, integer, text[]) FROM PUBLIC, anon, authenticated;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.discover_deals(text, numeric, integer, text[]) TO service_role;",
    );
    expect(sql).toContain(
      "REVOKE SELECT ON public.top_deals FROM anon, authenticated",
    );
  });

  it("no later migration re-grants deals SELECT or discover_deals to anon / authenticated", () => {
    const name = MIGRATION.split("/").pop()!;
    const later = readdirSync("supabase/migrations")
      .filter((f) => f.endsWith(".sql") && f > name)
      .sort();
    for (const f of later) {
      const body = readFileSync(`supabase/migrations/${f}`, "utf8");
      // Table-wide SELECT back to the client roles would undo the column grants.
      expect(body, f).not.toMatch(
        /GRANT\s+(SELECT|ALL)[^;]*\bON\s+(TABLE\s+)?public\.deals\b[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i,
      );
      expect(body, f).not.toMatch(
        /GRANT\s+EXECUTE[^;]*discover_deals[^;]*\bTO\b[^;]*\b(anon|authenticated|PUBLIC)\b/i,
      );
    }
  });
});

describe("no anon / browser select of non-granted deals columns", () => {
  it("scan route reads deals with the service-role server client, not the anon key", () => {
    const src = readFileSync("app/api/scan/route.ts", "utf8");
    expect(src).not.toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(src).toContain("createServerComponentClient()");
  });

  // Server code: everything under app/ (routes, server components, auth callback), server lib
  // modules, scripts. Client components ("use client") are the
  // browser and legitimately hold the anon key; they are checked by the deals-read tests below.
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(p);
      return /\.(ts|tsx|mjs|js)$/.test(e.name) && !/\.test\./.test(e.name)
        ? [p]
        : [];
    });
  const serverFiles = () =>
    ["app", "lib", "scripts"]
      .flatMap(walk)
      .filter((f) => !/^\s*["']use client["']/m.test(readFileSync(f, "utf8")));

  // Files allowed to name the anon key, and why. Anything else that does is a failure.
  const ANON_KEY_ALLOWED: Record<string, string> = {
    "lib/supabase.ts": "browser client factory (createClientComponentClient)",
    "lib/server-supabase.ts": "cookie session client for auth.getUser only",
    "lib/supabase/server.ts": "cookie session client for auth",
    "lib/system-readiness.ts": "env presence check, no client",
    "lib/auth/provider-readiness.ts": "env presence check, no client",
    "app/api/dealers/profile/route.ts":
      "cookie session client: RLS-scoped to the signed-in dealer's own row",
    "app/auth/callback/route.ts":
      "cookie session client for the OAuth / magic-link code exchange only",
    "lib/data/dealers-service.ts":
      "public dealers directory under RLS; must never read deals (asserted below)",
  };

  it("no server code falls back from the service role to the anon key (|| or ??)", () => {
    const fallback =
      /SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,40}?(\|\||\?\?)\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/;
    const offenders = ["app", "lib", "scripts"]
      .flatMap(walk)
      .filter((f) => fallback.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("guard regex catches ||, ?? and multi-line fallbacks (self-test)", () => {
    const fallback =
      /SUPABASE_SERVICE_ROLE_KEY[\s\S]{0,40}?(\|\||\?\?)\s*process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/;
    expect(
      fallback.test(
        "process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ),
    ).toBe(true);
    expect(
      fallback.test(
        "process.env.SUPABASE_SERVICE_ROLE_KEY ??\n      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ),
    ).toBe(true);
    expect(fallback.test('process.env.SUPABASE_SERVICE_ROLE_KEY || ""')).toBe(
      false,
    );
  });

  it("no server file builds a client from the anon key outside the allowlist", () => {
    const offenders = serverFiles().filter(
      (f) =>
        readFileSync(f, "utf8").includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") &&
        !(f in ANON_KEY_ALLOWED),
    );
    expect(offenders).toEqual([]);
  });

  it("direct createClient(url, ANON_KEY) only in allowlisted files, and those never read deals", () => {
    const direct =
      /createClient\(\s*[^,]+,\s*(process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY|resolvedPublicAnonKey\(\))/;
    for (const f of serverFiles()) {
      const src = readFileSync(f, "utf8");
      if (!direct.test(src)) continue;
      expect(Object.keys(ANON_KEY_ALLOWED), f).toContain(f);
      expect(src, f).not.toMatch(/from\(["'](deals|top_deals)["']\)/);
      expect(src, f).not.toMatch(/rpc\(["']discover_deals["']/);
    }
  });

  it("server code never reads deals / top_deals / discover_deals via the anon getSupabase()/getSupabaseClient()", () => {
    // Only the shared anon factories from @/lib/supabase count; files that define their own local
    // service-role getSupabase() (pipeline, vin) don't import these.
    const importsAnon =
      /import\s*\{[^}]*\b(getSupabase|getSupabaseClient)\b[^}]*\}\s*from\s*["']@\/lib\/supabase["']/;
    const readsDeals =
      /from\(["'](deals|top_deals)["']\)|rpc\(["']discover_deals["']/;
    const offenders = serverFiles().filter((f) => {
      const src = readFileSync(f, "utf8");
      return importsAnon.test(src) && readsDeals.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("demandIndex counts via the server client on a granted column", () => {
    const src = readFileSync("lib/hotFunctions/demandIndex.ts", "utf8");
    expect(src).not.toContain("getSupabaseClient");
    expect(src).toMatch(/select\("id", \{ count: "exact", head: true \}\)/);
  });

  it.each([
    "app/(dashboard)/lane/page.tsx",
    "app/(dashboard)/auctions/page.tsx",
  ])("%s goes through /api/deals/lane", (file) => {
    const src = readFileSync(file, "utf8");
    expect(src).not.toMatch(/from\(["']deals["']\)/);
    expect(src).toContain("/api/deals/lane");
  });

  it("scan realtime handlers read only granted columns", () => {
    const src = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
    const start = src.indexOf('.channel("scan-realtime")');
    const end = src.indexOf(".subscribe();", start);
    expect(start).toBeGreaterThan(-1);
    const used = Array.from(
      src.slice(start, end).matchAll(/\bd\.([a-z_]+)/g),
      (m) => m[1],
    );
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) {
      expect(DEALS_PUBLIC_COLUMNS as readonly string[]).toContain(c);
    }
  });
});
