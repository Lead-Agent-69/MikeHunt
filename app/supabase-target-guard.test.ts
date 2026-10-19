import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const expectedRef = "qupzqpezslsbobhugswp";
const token = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString(
      "base64url",
    ),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");

function run(overrides: Record<string, string> = {}) {
  return spawnSync(process.execPath, ["scripts/verify-supabase-target.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      EXPECTED_SUPABASE_PROJECT_REF: expectedRef,
      NEXT_PUBLIC_SUPABASE_URL: `https://${expectedRef}.supabase.co`,
      SUPABASE_SERVICE_ROLE_KEY: token({
        ref: expectedRef,
        role: "service_role",
      }),
      ...overrides,
    },
  });
}

describe("accuracy workflow Supabase target guard", () => {
  it("runs before the accuracy audit against the pinned production project", () => {
    const workflow = readFileSync(".github/workflows/accuracy.yml", "utf8");
    expect(workflow).toContain(`EXPECTED_SUPABASE_PROJECT_REF: ${expectedRef}`);
    expect(workflow).toContain("node scripts/verify-supabase-target.mjs");
    expect(
      workflow.indexOf("node scripts/verify-supabase-target.mjs"),
    ).toBeLessThan(workflow.indexOf("npm run accuracy"));
  });

  it("accepts a matching production URL and service-role JWT", () => {
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Supabase target verified: ${expectedRef}`);
  });

  const invalidConfigurations: Array<Record<string, string>> = [
    {
      NEXT_PUBLIC_SUPABASE_URL: "https://old-project.supabase.co",
    },
    {
      SUPABASE_SERVICE_ROLE_KEY: token({
        ref: "old-project",
        role: "service_role",
      }),
    },
    {
      SUPABASE_SERVICE_ROLE_KEY: token({ ref: expectedRef, role: "anon" }),
    },
    { SUPABASE_SERVICE_ROLE_KEY: "not-a-jwt" },
  ];

  it.each(invalidConfigurations)(
    "rejects stale or invalid database configuration",
    (overrides) => {
      const result = run(overrides);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Supabase target guard failed:");
      if (overrides.SUPABASE_SERVICE_ROLE_KEY) {
        expect(result.stderr).not.toContain(
          overrides.SUPABASE_SERVICE_ROLE_KEY,
        );
      }
    },
  );
});
