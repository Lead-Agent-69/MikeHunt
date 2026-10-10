/**
 * Who we are when we crawl. One honest, stable User-Agent with a contact URL, so a site owner can see
 * exactly who is visiting and how to reach us or opt out. No rotation, no browser impersonation.
 */
export const BOT_TOKEN = "MikeHuntBot";
export const BOT_VERSION = "1.0";

function siteUrl(): string {
  const raw = (
    process.env.NEXT_PUBLIC_APP_URL || "https://mikehunt-69.vercel.app"
  ).trim();
  return raw.replace(/\/+$/, "");
}

/** Public page that explains the crawler, its limits, and how to opt out. */
export function botInfoUrl(): string {
  return `${siteUrl()}/bot`;
}

/** e.g. "MikeHuntBot/1.0 (+https://mikehunt-69.vercel.app/bot)" */
export function politeUserAgent(): string {
  return `${BOT_TOKEN}/${BOT_VERSION} (+${botInfoUrl()})`;
}

/** The robots.txt token we match on (lowercase, per RFC 9309). */
export const ROBOTS_AGENT = BOT_TOKEN.toLowerCase();
