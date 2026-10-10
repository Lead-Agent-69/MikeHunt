import { createECDH } from "node:crypto";
import { validGrant, type AccessGrant } from "@/lib/scrapers/access-policy";
import { VAPID_PUBLIC_KEY } from "@/lib/notifications/vapid";

export interface ConfigurationCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export function configurationPreflight({
  env,
  grants,
  projectRef,
  scope = "all",
  now = Date.now(),
}: {
  env: Record<string, string | undefined>;
  grants: readonly AccessGrant[];
  projectRef: string;
  scope?: "core" | "alerts" | "all";
  now?: number;
}): ConfigurationCheck[] {
  const checks: ConfigurationCheck[] = [];
  const add = (id: string, ok: boolean, detail: string) =>
    checks.push({ id, ok, detail });
  if (scope !== "alerts") {
    const keys = grants.map((g) => `${g.sourceId}|${g.host}|${g.route}`);
    add(
      "source-evidence",
      grants.length > 0 &&
        grants.every((g) => validGrant(g, now)) &&
        new Set(keys).size === keys.length,
      "Reviewed, current, unique source grants are required; selection and classifications are not permission.",
    );
    add(
      "publishable-source",
      grants.some((g) => validGrant(g, now) && g.collect && g.display),
      "At least one source must permit both collection and display before inventory cutover.",
    );
    let matchesProject = false;
    try {
      const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL || "");
      matchesProject =
        /^[a-z0-9]+$/.test(projectRef) &&
        url.protocol === "https:" &&
        url.hostname === `${projectRef}.supabase.co` &&
        !url.username &&
        !url.password;
    } catch {
      /* Invalid or missing URL is a failed check. */
    }
    add(
      "supabase-project",
      matchesProject,
      "The configured database must match the explicitly expected hosted project.",
    );
    add(
      "supabase-server-key",
      Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY),
      "A server-only Supabase key is required; an anon key is not a fallback.",
    );
    let redisConfigured = false;
    try {
      const url = new URL(env.REDIS_URL || "");
      redisConfigured =
        ["redis:", "rediss:"].includes(url.protocol) && Boolean(url.hostname);
    } catch {
      /* Do not expose connection strings. */
    }
    add(
      "shared-host-coordination",
      redisConfigured,
      "Scraper collection requires shared Redis coordination; connectivity is verified separately.",
    );
    add(
      "persistent-ingestion",
      env.CACHE_ONLY_MODE === "false",
      "Explicit CACHE_ONLY_MODE=false is required for the worker's persistent-ingestion deployment.",
    );
  }
  if (scope !== "core") {
    let keysMatch = false;
    try {
      const privateKey = env.VAPID_PRIVATE_KEY || "";
      const publicKey = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY;
      if (
        /^[A-Za-z0-9_-]{43}$/.test(privateKey) &&
        /^[A-Za-z0-9_-]{87}$/.test(publicKey)
      ) {
        const ecdh = createECDH("prime256v1");
        ecdh.setPrivateKey(Buffer.from(privateKey, "base64url"));
        keysMatch = ecdh
          .getPublicKey()
          .equals(Buffer.from(publicKey, "base64url"));
      }
    } catch {
      /* Malformed keys are reported without values. */
    }
    add(
      "push-key-pair",
      keysMatch,
      "VAPID private/public keys must form one matching P-256 key pair. Preserve existing subscription identity.",
    );
    const subject = env.VAPID_SUBJECT || "";
    let subjectValid = /^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subject);
    try {
      const url = new URL(subject);
      subjectValid ||=
        url.protocol === "https:" &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password;
    } catch {
      /* mailto validation is handled above. */
    }
    add(
      "push-contact",
      subjectValid,
      "Set a valid mailto or HTTPS operator contact subject.",
    );
    add(
      "email-provider",
      Boolean(env.RESEND_API_KEY),
      "Resend delivery requires its server-side API key and a verified sender.",
    );
    add(
      "email-webhook-secret",
      /^whsec_[A-Za-z0-9+/=_-]+$/.test(env.RESEND_WEBHOOK_SECRET || ""),
      "Set the signing secret for the registered Resend webhook; delivery proof is a separate test.",
    );
    let appUrlValid = false;
    try {
      const url = new URL(env.NEXT_PUBLIC_APP_URL || "");
      appUrlValid =
        url.protocol === "https:" &&
        Boolean(url.hostname) &&
        !url.username &&
        !url.password;
    } catch {
      /* Deep links must use a valid public origin. */
    }
    add(
      "notification-origin",
      appUrlValid,
      "Notification links require the production HTTPS app URL.",
    );
  }
  return checks;
}
