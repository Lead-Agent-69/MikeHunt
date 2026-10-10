import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("/api/checkout/beta-access (retired)", () => {
  it("GET redirects to /upgrade", async () => {
    const res = await GET(
      new Request("http://localhost/api/checkout/beta-access"),
    );
    expect(res.headers.get("location")).toBe("http://localhost/upgrade");
  });

  it("POST is gone and never touches Supabase or Stripe", async () => {
    const res = await POST();
    expect(res.status).toBe(410);
    const src = readFileSync("app/api/checkout/beta-access/route.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");
    expect(src).not.toMatch(/supabase|stripe\.webhooks|user_profiles/i);
  });
});

describe("billing writes to user_profiles plan/role/stripe_* only via the service role", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory()
        ? walk(p)
        : /route\.ts$/.test(n)
          ? [p]
          : [];
    });

  it("no API route writes billing columns through a cookie/anon client", () => {
    const offenders = walk("app/api").filter((f) => {
      const src = readFileSync(f, "utf8");
      const writesBilling =
        /from\(["']user_profiles["']\)[\s\S]{0,200}\.(update|upsert|insert)\(\s*\{[\s\S]{0,400}\b(plan|role|stripe_customer_id|stripe_subscription_id)\s*:/.test(
          src,
        );
      const userScoped = /from\s+["']@\/lib\/supabase\/server["']/.test(src);
      return writesBilling && userScoped;
    });
    expect(offenders).toEqual([]);
  });

  it("the canonical webhook verifies the Stripe signature and uses the service role", () => {
    const src = readFileSync("app/api/billing/webhook/route.ts", "utf8");
    expect(src).toContain("stripe.webhooks.constructEvent(");
    expect(src).toContain("createServerComponentClient()");
    expect(src).not.toMatch(
      /subscription_tier|beta_access|subscription_status\s*:/,
    );
  });
});
