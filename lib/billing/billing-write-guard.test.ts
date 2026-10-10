import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Billing / privilege columns are server-managed (20261010040000_profile_privilege_lockdown):
// only the service role may write them. A user-session client (cookie / browser / SSR) writing them
// would either fail with 42501 at runtime or, if grants ever regress, be a privilege escalation.
const PROTECTED = [
  "plan",
  "role",
  "plan_started_at",
  "plan_ended_at",
  "stripe_customer_id",
  "stripe_subscription_id",
];

// Any way a module gets a user-session (non-service-role) Supabase client.
const SESSION_CLIENT = [
  /from\s+["']@\/lib\/supabase\/server["']/,
  /from\s+["']@\/lib\/server-supabase["']/,
  /from\s+["']@\/lib\/supabase\/client["']/,
  /\bcreateServerClient\s*\(/,
  /\bcreateBrowserClient\s*\(/,
  /\bcreateRouteHandlerClient\s*\(/,
  /\bcreateClientComponentClient\s*\(/,
  /\bgetSupabaseClient\s*\(/,
  /\bgetSupabase\s*\(/,
  /\bcreateClient\s*\([^)]*ANON_KEY/,
];

/** Drop block and line comments (keeping "://" in URLs) so commented-out code can't trip or hide. */
export function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

// Client modules that only DEFINE the session client (no writes) are scanned like everything else.
const EXT = /\.(ts|tsx)$/;

function walk(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.flatMap((n) => {
    if (n === "node_modules" || n.startsWith(".")) return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return EXT.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

const keyRe = new RegExp(
  // bare, single- or double-quoted object key: plan: / "plan": / 'stripe_customer_id':
  `(?:^|[\\s{,(])["']?(?:${PROTECTED.join("|")})["']?\\s*:`,
  "m",
);
const writeRe = /\.(update|upsert|insert)\s*\(/;
const profilesRe = /["'`](user_profiles|profiles)["'`]/;
const rpcRe = /\.rpc\s*\(/;

export function billingWriteOffence(raw: string): string | null {
  const src = stripComments(raw);
  if (!SESSION_CLIENT.some((r) => r.test(src))) return null;
  if (!keyRe.test(src)) return null;
  // Table writes (payload may be a variable built elsewhere in the module) or RPC calls with a
  // protected key in the module.
  if (profilesRe.test(src) && writeRe.test(src))
    return "profiles write with protected key";
  if (rpcRe.test(src)) return "rpc with protected key";
  return null;
}

describe("billing columns are written only through the service role", () => {
  it("detector catches literals, quoted keys, variables and rpc", () => {
    const sess = 'import { createClient } from "@/lib/supabase/server";\n';
    expect(
      billingWriteOffence(
        sess + 'sb.from("user_profiles").update({ plan: "pro" })',
      ),
    ).not.toBeNull();
    expect(
      billingWriteOffence(
        sess + `sb.from('user_profiles').upsert({ 'stripe_customer_id': x })`,
      ),
    ).not.toBeNull();
    expect(
      billingWriteOffence(
        sess +
          'const patch = { "role": "admin" };\nawait sb.from("profiles").update(patch);',
      ),
    ).not.toBeNull();
    expect(
      billingWriteOffence(sess + 'await sb.rpc("set_plan", { plan: "pro" })'),
    ).not.toBeNull();
    expect(
      billingWriteOffence(
        'import { createServerClient } from "@supabase/ssr";\nconst c = createServerClient(u,k,o);\nc.from("user_profiles").update({ plan_ended_at: now })',
      ),
    ).not.toBeNull();
    expect(
      billingWriteOffence(
        'const sb = getSupabaseClient();\nawait sb.from("user_profiles").update({ plan: "pro" })',
      ),
    ).not.toBeNull();
    expect(
      billingWriteOffence(
        'const sb = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);\nsb.from("profiles").upsert({ stripe_subscription_id: s })',
      ),
    ).not.toBeNull();
    // comments are ignored in both directions
    expect(
      billingWriteOffence(
        'import { createServerComponentClient } from "@/lib/supabase";\n// getSupabaseClient() used to do this\nsb.from("user_profiles").update({ plan: "pro" })',
      ),
    ).toBeNull();
    expect(
      billingWriteOffence(
        'const sb = getSupabase();\n/* sb.from("user_profiles").update({ plan: "pro" }) */\nsb.from("deals").select("id")',
      ),
    ).toBeNull();
    // service role is fine
    expect(
      billingWriteOffence(
        'import { createServerComponentClient } from "@/lib/supabase";\nsb.from("user_profiles").update({ plan: "pro" })',
      ),
    ).toBeNull();
  });

  it("no module in app/ or lib/ writes plan/role/stripe_* through a session client", () => {
    const offenders = ["app", "lib"]
      .flatMap(walk)
      .map((f) => [f, billingWriteOffence(readFileSync(f, "utf8"))] as const)
      .filter(([, why]) => why !== null);
    expect(offenders).toEqual([]);
  });
});
