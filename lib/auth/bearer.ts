import { createHash, timingSafeEqual } from "crypto";

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * Constant-time check that an Authorization header is exactly `Bearer <secret>`. Both sides are
 * SHA-256 hashed first, so timingSafeEqual always compares two 32-byte buffers: no early return on a
 * length mismatch, so not even the secret's length leaks through timing (Ren #309 P3-6).
 * Fails closed when either side is missing or empty.
 */
export function bearerMatches(
  presented: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!presented || !secret) return false;
  return timingSafeEqual(sha256(presented), sha256(`Bearer ${secret}`));
}
