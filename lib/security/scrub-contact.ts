const URL = /(?:\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.)(?:[^\s"<>`]|(?<=\w)[)'])+/gi;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const PHONE =
  /(?<![\w$,+.-])(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]\d{4}(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?(?![\w.-])/gi;

/** Remove contact-shaped text before externally supplied fields enter persisted display copy. */
export function scrubContact(text: string): string {
  return String(text || "")
    .replace(URL, " ")
    .replace(EMAIL, " ")
    .replace(PHONE, " ")
    .replace(/\s+/g, " ")
    .trim();
}
