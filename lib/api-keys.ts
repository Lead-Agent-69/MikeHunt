// lib/api-keys.ts
// Public-API key minting + hashing. Keys are stored hashed (sha256); the plaintext is shown to the
// dealer exactly once at creation.

import crypto from "crypto";

export function generateApiKey(): {
  raw: string;
  hash: string;
  prefix: string;
} {
  const raw = "dhp_" + crypto.randomBytes(24).toString("base64url");
  return { raw, hash: hashApiKey(raw), prefix: raw.slice(0, 12) };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw.trim()).digest("hex");
}
