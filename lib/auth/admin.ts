// lib/auth/admin.ts
// Single-admin model: one email has full access to the ops/dev surfaces (developer API, system
// status, scraper orchestrator). Everyone else is a dealer and never sees or reaches them. The check
// is by email so it's stable across sessions; override with ADMIN_EMAIL in env.
export const ADMIN_EMAIL = (
  process.env.ADMIN_EMAIL ||
  process.env.NEXT_PUBLIC_ADMIN_EMAIL ||
  "shy.love.garden@gmail.com"
)
  .trim()
  .toLowerCase();

export function isAdminEmail(email?: string | null): boolean {
  return !!email && email.trim().toLowerCase() === ADMIN_EMAIL;
}

// Admin-only PAGES, enforced server-side in middleware. (APIs keep their own secret/key auth so CI &
// cron — which have no user session — still work; we don't email-gate machine callers.)
export const ADMIN_ROUTES = ["/developer", "/status", "/orchestrator"];
