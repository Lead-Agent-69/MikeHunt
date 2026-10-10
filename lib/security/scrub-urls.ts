/**
 * URL scrubber shared by deal-check (user-pasted links must not reach Sentry) and the scraper run log
 * (error messages and dead-letter reasons can embed listing URLs with query strings and contact data).
 */
export const URL_IN_TEXT = /\b(?:https?|wss?):\/\/[^\s"'<>)]*/gi;

/** Replace every URL in free text with "[url]". */
export function scrubUrls(text: string): string {
  return String(text ?? "").replace(URL_IN_TEXT, "[url]");
}
