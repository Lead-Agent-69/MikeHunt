import { lookup as dnsLookup } from "dns/promises";
import { isIP } from "net";

/**
 * Reject fetch targets that can reach the local host, RFC1918, link-local,
 * or cloud metadata. Ambiguous IP encodings fail closed.
 */
export class UrlNotAllowedError extends Error {
  constructor(message = "URL is not allowed") {
    super(message);
    this.name = "UrlNotAllowedError";
  }
}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google",
  "metadata.google.internal",
  "instance-data",
]);

export function isBlockedIp(address: string): boolean {
  const raw = address.trim().toLowerCase();
  const mapped = ipv4FromMapped(raw);
  if (mapped) return isBlockedIp(mapped);
  if (isIP(raw) === 4) return isBlockedV4(raw.split(".").map(Number) as Quad);
  if (raw.includes(":")) return isBlockedV6(raw);
  return false;
}

type Quad = [number, number, number, number];

function isBlockedV4(parts: number[]): boolean {
  if (parts.length !== 4 || parts.some((n) => n < 0 || n > 255)) return true;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedV6(ip: string): boolean {
  const norm = ip.toLowerCase();
  if (norm === "::" || norm === "::1") return true;
  if (norm.startsWith("fc") || norm.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(norm)) return true;
  return false;
}

function ipv4FromMapped(ip: string): string | null {
  const dotted = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return dotted[1];
  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(
    ".",
  );
}

/** "blocked" | "public" | "not-ip". Weird encodings are blocked, not resolved. */
export function classifyHostname(hostname: string): "blocked" | "public" | "not-ip" {
  const host = hostname
    .replace(/^\[|\]$/g, "")
    .toLowerCase()
    .replace(/\.$/, "");
  if (!host) return "blocked";
  if (BLOCKED_HOSTS.has(host)) return "blocked";
  if (
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return "blocked";
  }
  if (isIP(host) === 6 || host.includes(":")) {
    return isBlockedIp(host) ? "blocked" : "public";
  }
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return "blocked";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split(".");
    if (parts.some((p) => p.length > 1 && p.startsWith("0"))) return "blocked";
    const nums = parts.map(Number);
    if (nums.some((n) => n > 255)) return "blocked";
    return isBlockedV4(nums) ? "blocked" : "public";
  }
  return "not-ip";
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UrlNotAllowedError();
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlNotAllowedError();
  }
  if (parsed.username || parsed.password) throw new UrlNotAllowedError();
  const host = parsed.hostname;
  const kind = classifyHostname(host);
  if (kind === "blocked") throw new UrlNotAllowedError();
  if (kind === "public") return parsed;
  await resolvePublicAddresses(host);
  return parsed;
}

export async function resolvePublicAddresses(hostname: string): Promise<string[]> {
  const kind = classifyHostname(hostname);
  if (kind === "blocked") throw new UrlNotAllowedError();
  if (kind === "public") return [hostname.replace(/^\[|\]$/g, "")];
  let records: { address: string }[];
  try {
    records = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlNotAllowedError();
  }
  const addresses = records.map((record) => record.address);
  if (addresses.length === 0 || addresses.some((address) => isBlockedIp(address))) {
    throw new UrlNotAllowedError();
  }
  return addresses;
}
