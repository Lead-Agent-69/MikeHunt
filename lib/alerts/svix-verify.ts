import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Svix-signed webhook (Resend uses Svix). Secret format: "whsec_<base64>".
 * Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256, base64; the
 * svix-signature header is a space-separated list of "v1,<sig>". Rejects timestamps more than
 * `toleranceSec` away from now (replay protection).
 */
export function verifySvixSignature(opts: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  nowSec?: number;
  toleranceSec?: number;
}): boolean {
  const { secret, id, timestamp, signature, body } = opts;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > (opts.toleranceSec ?? 300)) return false;

  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return false;
  }
  if (!key.length) return false;
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  for (const part of signature.split(" ")) {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) continue;
    let given: Buffer;
    try {
      given = Buffer.from(sig, "base64");
    } catch {
      continue;
    }
    if (given.length === expected.length && timingSafeEqual(given, expected))
      return true;
  }
  return false;
}
