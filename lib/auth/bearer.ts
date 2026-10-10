import { timingSafeEqual } from "crypto";

/**
 * Constant-time check that an Authorization header is exactly `Bearer <secret>`. A length mismatch
 * returns early (timingSafeEqual needs equal-length buffers), which only reveals the length.
 * Fails closed when either side is missing.
 */
export function bearerMatches(
  presented: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!presented || !secret) return false;
  const left = Buffer.from(presented);
  const right = Buffer.from(`Bearer ${secret}`);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
