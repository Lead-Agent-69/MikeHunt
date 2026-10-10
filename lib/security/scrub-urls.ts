/**
 * Scrubbers shared by deal-check (user-pasted links must not reach Sentry) and the scraper run log
 * (error messages, dead-letter reasons and raw page snippets can embed listing URLs with query
 * strings, credentials and seller contact details).
 *
 * URLs: any scheme (http, https, ws, ftp, postgres://user:pw@host, s3, ...), protocol-relative
 * //host.tld/..., and scheme-less www.host... A URL may contain ' and ) (they are only trimmed when
 * they are the last characters, i.e. the sentence's quote or parenthesis), so nothing after them
 * leaks.
 */
export const URL_IN_TEXT =
  /(?:\b[a-z][a-z0-9+.-]*:\/\/|(?<![\w:/])\/\/(?=[a-z0-9-]+\.[a-z0-9-])|\bwww\.(?=[a-z0-9-]+\.))[^\s"<>`]+/gi;

const TRAILING = /[')\].,;:!?]+$/;

/** Replace every URL in free text with "[url]" (trailing quote/paren/punctuation kept). */
export function scrubUrls(text: string): string {
  return String(text ?? "").replace(URL_IN_TEXT, (m) => {
    const tail = m.match(TRAILING)?.[0] ?? "";
    return `[url]${tail}`;
  });
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
// North American (optionally +1) and international (+CC ...) numbers. Requires 10+ digits, so prices,
// years, mileage and ZIPs are left alone.
const PHONE_NA = /(?<![\w+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g;
const PHONE_INTL = /(?<!\w)\+\d{1,3}(?:[\s.-]?\d){8,13}(?!\w)/g;

export function scrubEmails(text: string): string {
  return String(text ?? "").replace(EMAIL, "[email]");
}

export function scrubPhones(text: string): string {
  return String(text ?? "")
    .replace(PHONE_INTL, "[phone]")
    .replace(PHONE_NA, "[phone]");
}

/** URLs, then emails, then phone numbers. Use on anything that may carry seller contact data. */
export function scrubContact(text: string): string {
  return scrubPhones(scrubEmails(scrubUrls(text)));
}
