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

  it("preserves refreshed session cookies while middleware redirects", () => {
    const middleware = readFileSync("middleware.ts", "utf8");
    expect(middleware).toContain("supabase.auth.getClaims");
    expect(middleware).toContain("redirectWithAuthCookies");
    expect(middleware).toContain("supabaseResponse.cookies\n      .getAll()");
  });
});
