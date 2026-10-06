import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("account creation security", () => {
  it("does not expose service-role user creation through the public provision route", () => {
    const route = readFileSync("app/api/auth/provision/route.ts", "utf8");
    expect(route).not.toContain("auth.admin.createUser");
    expect(route).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(route).toContain("status: 410");
  });

  it("uses public Supabase signup and authenticated bootstrap", () => {
    const register = readFileSync("app/(auth)/register/page.tsx", "utf8");
    const bootstrap = readFileSync("app/api/auth/bootstrap/route.ts", "utf8");
    expect(register).toContain("supabase.auth.signUp");
    expect(register).toContain("/api/auth/bootstrap");
    expect(bootstrap).toContain("getServerUser");
    expect(bootstrap).toContain("status: 401");
  });

  it("preserves refreshed session cookies while proxy redirects", () => {
    // Windows runners may check out CRLF; normalize before multiline asserts.
    const proxy = readFileSync("proxy.ts", "utf8").replace(/\r\n/g, "\n");
    expect(proxy).toContain("supabase.auth.getClaims");
    expect(proxy).toContain("redirectWithAuthCookies");
    expect(proxy).toContain("supabaseResponse.cookies\n      .getAll()");
  });

  it("server-gates the admin workspace and keeps automation secrets off the client", () => {
    const admin = readFileSync("lib/auth/admin.ts", "utf8");
    const operations = readFileSync("lib/auth/admin-operations.ts", "utf8");
    expect(admin).toContain('"/admin"');
    expect(admin).not.toContain("NEXT_PUBLIC_ADMIN_EMAIL");
    expect(operations).toContain("canManageOperations");
    expect(operations).toContain("process.env.INGEST_SECRET");

    const adminPage = readFileSync("app/(dashboard)/admin/page.tsx", "utf8");
    expect(adminPage).not.toContain("INGEST_SECRET");
    expect(adminPage).not.toContain("SCRAPE_SECRET");

    const stats = readFileSync("app/api/admin/stats/route.ts", "utf8");
    expect(stats).toContain("canManageOperations(req)");
    expect(stats).not.toContain("supabase.auth.getUser()");

    const registry = readFileSync("app/api/scrape/registry/route.ts", "utf8");
    expect(registry).toContain("allowAdminSession: true");
    expect(registry).toContain('await import("@/lib/scrapers/runner")');
  });

  it("returns OAuth session cookies on the callback redirect", () => {
    const callback = readFileSync("app/auth/callback/route.ts", "utf8");
    expect(callback).toContain("const response = NextResponse.redirect");
    expect(callback).toContain("response.cookies.set(name, value, options)");
    expect(callback).toContain("return response;");
    expect(callback).toContain(
      'response.headers.set("location", `${base}/onboarding`)',
    );
    expect(callback).not.toContain('import { cookies } from "next/headers"');
  });
});
