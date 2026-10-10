import { createECDH } from "node:crypto";
import { describe, expect, it } from "vitest";
import { configurationPreflight } from "./configuration-preflight";

const now = Date.parse("2026-10-10T12:00:00Z");
const grant = {
  sourceId: "approved",
  host: "feed.example",
  route: "feed" as const,
  evidence: "https://feed.example/terms",
  reviewedAt: "2026-10-01T00:00:00Z",
  expiresAt: "2026-11-01T00:00:00Z",
  collect: true,
  display: true,
  derive: false,
};
function environment() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return {
    NEXT_PUBLIC_SUPABASE_URL: "https://expected.supabase.co",
    SUPABASE_SECRET_KEY: "server-only-test",
    REDIS_URL: "redis://redis:6379",
    CACHE_ONLY_MODE: "false",
    VAPID_PRIVATE_KEY: ecdh.getPrivateKey().toString("base64url"),
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: ecdh.getPublicKey().toString("base64url"),
    VAPID_SUBJECT: "mailto:operator@example.com",
    RESEND_API_KEY: "test-email-secret",
    RESEND_WEBHOOK_SECRET: "whsec_test",
    NEXT_PUBLIC_APP_URL: "https://app.example",
  };
}
describe("read-only release configuration checks", () => {
  it("accepts matching configuration, including modern server keys", () => {
    expect(
      configurationPreflight({
        env: environment(),
        grants: [grant],
        projectRef: "expected",
        now,
      }).every((c) => c.ok),
    ).toBe(true);
  });
  it("blocks empty, expired, duplicate and non-display source permissions", () => {
    for (const grants of [
      [],
      [grant, grant],
      [{ ...grant, expiresAt: "2026-10-09T00:00:00Z" }],
    ]) {
      expect(
        configurationPreflight({
          env: environment(),
          grants,
          projectRef: "expected",
          now,
        }).find((c) => c.id === "source-evidence")?.ok,
      ).toBe(false);
    }
    expect(
      configurationPreflight({
        env: environment(),
        grants: [{ ...grant, display: false }],
        projectRef: "expected",
        now,
      }).find((c) => c.id === "publishable-source")?.ok,
    ).toBe(false);
  });
  it("rejects another project's URL and mismatched push identity without printing secrets", () => {
    const env = environment();
    env.NEXT_PUBLIC_SUPABASE_URL = "https://wrong.supabase.co";
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      environment().NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const checks = configurationPreflight({
      env,
      grants: [grant],
      projectRef: "expected",
      now,
    });
    expect(checks.find((c) => c.id === "supabase-project")?.ok).toBe(false);
    expect(checks.find((c) => c.id === "push-key-pair")?.ok).toBe(false);
    expect(JSON.stringify(checks)).not.toContain(env.VAPID_PRIVATE_KEY);
    expect(JSON.stringify(checks)).not.toContain(env.RESEND_API_KEY);
  });
  it("keeps worker and alert configuration independently inspectable", () => {
    const checks = configurationPreflight({
      env: {},
      grants: [],
      projectRef: "expected",
      scope: "alerts",
      now,
    });
    expect(checks.some((c) => c.id === "persistent-ingestion")).toBe(false);
    expect(checks.every((c) => !c.ok)).toBe(true);
  });
});
