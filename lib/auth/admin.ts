// lib/auth/admin.ts
// Single-admin model: one email has full access to the ops/dev surfaces (developer API, system
// status, scraper orchestrator). Everyone else is a dealer and never sees or reaches them. The check
// is by email so it's stable across sessions; it MUST come from the server-only ADMIN_EMAIL setting.
//
// There is deliberately no hardcoded fallback address: a default account baked into source is a
// permanent PII leak and a silent backdoor if the env var is ever dropped. Admin gating fails CLOSED
// instead — with no ADMIN_EMAIL configured, isAdminEmail() returns false for everyone.
export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

let warnedMissingAdminEmail = false;

export function isAdminEmail(email?: string | null): boolean {
  if (!ADMIN_EMAIL) {
    // Once per process, so a misconfigured deploy is visible in logs without flooding them.
    if (!warnedMissingAdminEmail) {
      warnedMissingAdminEmail = true;
      console.error(
        "[auth] ADMIN_EMAIL is not set — admin-only routes are locked for every user.",
      );
    }
    return false;
  }
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL;
}

// True when the env is configured — lets health/status surfaces report "admin: unconfigured"
// instead of silently meaning "nobody is admin".
export function isAdminConfigured(): boolean {
  return ADMIN_EMAIL.length > 0;
}

// Admin-only pages, enforced server-side in middleware. APIs keep their own
// secret/key auth so CI and cron callers without a user session continue to work.
// Source operations and system diagnostics are intentionally kept off customer pages.
export const ADMIN_ROUTES = [
  "/admin",
  "/developer",
  "/orchestrator",
  "/sources",
  "/status",
];
