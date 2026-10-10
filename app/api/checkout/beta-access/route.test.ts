import { readFileSync } from "node:fs";
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

// The repo-wide billing-write guard lives in lib/billing/billing-write-guard.test.ts.
