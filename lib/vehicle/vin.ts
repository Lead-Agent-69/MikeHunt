// VIN validation + extraction. A real VIN is 17 chars, excludes I/O/Q, and carries a check digit
// (ISO 3779, position 9) — so we can both reject garbage 17-char strings and confidently pull a VIN
// out of free text (Craigslist bodies, ingest titles/descriptions). Pure, no I/O, fully testable.

const TRANSLIT: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
};

// Positional weights, indices 0..16 (position 9 / index 8 is the check digit itself, weight 0).
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

const VIN_CHARS = /^[A-HJ-NPR-Z0-9]{17}$/;

export function normalizeVin(raw: string): string {
  return (raw || "").toUpperCase().replace(/[\s-]/g, "").trim();
}

/** True for a syntactically valid VIN with a correct ISO-3779 check digit. */
export function isValidVin(raw: string): boolean {
  const vin = normalizeVin(raw);
  if (!VIN_CHARS.test(vin)) return false;

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const v = TRANSLIT[vin[i]];
    if (v === undefined) return false;
    sum += v * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? "X" : String(remainder);
  return vin[8] === expected;
}

/**
 * Find the first valid VIN in arbitrary text. Scans every 17-char token of the VIN alphabet and
 * returns the first that passes the check digit — so a real VIN buried in a description is found,
 * and random 17-char strings (which almost never satisfy the check digit) are rejected.
 */
export function extractVin(text: string | null | undefined): string | null {
  if (!text) return null;
  const upper = text.toUpperCase();
  const re = /\b[A-HJ-NPR-Z0-9]{17}\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(upper)) !== null) {
    if (isValidVin(m[0])) return m[0];
  }
  return null;
}
