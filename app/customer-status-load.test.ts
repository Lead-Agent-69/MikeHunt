import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("does not run operations diagnostics on signup or ordinary inventory browsing", () => {
  const register = readFileSync("app/(auth)/register/page.tsx", "utf8");
  expect(register).not.toContain("/api/system/status");
  expect(register).not.toContain("liveStats");
  const scan = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");
  expect(scan).toMatch(/useSWR\(\s*isAdmin \? "\/api\/system\/status" : null/);
});
