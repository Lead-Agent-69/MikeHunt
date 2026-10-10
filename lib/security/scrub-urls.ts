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

/**
 * Source-path schemes in stack traces (file:///app/.next/server/chunks/1.js, webpack-internal:///(rsc)/./
 * lib/x.ts, app:///_next/...). They name our own code, not a listing or a user, and Sentry needs them
 * to symbolicate, so they are kept (Ren #314 f) — but only with an EMPTY authority (three slashes):
 * file://evil.com/c?e=… or rsc://attacker.com/… is a real remote URL and is scrubbed like any other
 * (Ren #323). A kept path loses everything from the first ? or #.
 */
const SOURCE_PATH = /^(?:file|webpack|webpack-internal|turbopack|node|rsc|app):\/\/\//i;

/** Replace every URL in free text with "[url]" (trailing quote/paren/punctuation kept). */
export function scrubUrls(text: string): string {
  return String(text ?? "").replace(URL_IN_TEXT, (m) => {
    const tail = m.match(TRAILING)?.[0] ?? "";
    const body = m.slice(0, m.length - tail.length);
    if (SOURCE_PATH.test(body)) {
      const q = body.search(/[?#]/);
      return q < 0 ? m : body.slice(0, q) + tail;
    }
    return `[url]${tail}`;
  });
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
// Phone numbers (Ren #314 b). Separators: space . - en/em dash and slash. Optional extension
// (x22, ext. 22). Shapes:
//   international  +44 (0)20 7946 0958, +1 214 555 0100, 0049 30 123456   (8+ digits)
//   North American (214) 555-0100, 214-555-0100, 555/123-4567, 1-800-555-0100, 2145550100
//   national trunk 020 7946 0958, 0161 496 0000
//   local 7-digit  555-1234, 555.1234 (a separator is required)
// The lookarounds keep VINs, ZIP / ZIP+4, prices, years, year ranges and mileage out: no match may
// start right after a letter, digit, $, comma, dot, dash or slash, or run into one.
const S = String.raw`[\s.\-\u2013\u2014/]`;
const EXT = String.raw`(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?`;
const PHONE_SHAPES = [
  String.raw`(?:\+|\b00\s?)\d{1,3}(?:\s?\(0\))?(?:${S}?\(?\d{1,4}\)?){2,6}`,
  String.raw`(?:\+?1${S}?)?\(\d{3}\)\s?\d{3}${S}\d{4}`,
  String.raw`(?:\+?1${S})?\d{3}${S}\d{3}${S}\d{4}`,
  String.raw`(?:\+?1)?\d{10}`,
  String.raw`0\d{1,4}${S}\d{3,4}${S}?\d{3,4}`,
  String.raw`\d{3}[.\-\u2013]\d{4}`,
];
const PHONE = new RegExp(
  String.raw`(?<![\w$\u20ac\u00a3,.\-\u2013\u2014/+])(?:${PHONE_SHAPES.join("|")})${EXT}(?![\w\-\u2013]|[.,/]\d)`,
  "gi",
);

export function scrubEmails(text: string): string {
  return String(text ?? "").replace(EMAIL, "[email]");
}

export function scrubPhones(text: string): string {
  return String(text ?? "").replace(PHONE, (m) => {
    // International shape needs at least 8 digits; shorter "+12 34" style runs are left alone.
    const digits = m.replace(/\D/g, "").length;
    return /^(\+|00)/.test(m) && digits < 8 ? m : "[phone]";
  });
}

/** URLs, then emails, then phone numbers. Use on anything that may carry seller contact data. */
export function scrubContact(text: string): string {
  return scrubPhones(scrubEmails(scrubUrls(text)));
}
