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
  if (raw.includes(":")) {
    const embedded = ipv4EmbeddedInV6(raw);
    if (embedded === "malformed") return true;
    if (embedded) return isBlockedIp(embedded);
    return isBlockedV6(raw);
  }
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

/**
 * IPv4 hidden in IPv6. 6to4 is 2002::/16 (RFC 3056). NAT64 well-known prefixes
 * are 64:ff9b::/96 (RFC 6052) and 64:ff9b:1::/48 (RFC 8215). "malformed" fails closed.
 */
export function ipv4EmbeddedInV6(address: string): string | "malformed" | null {
  const bytes = parseIpv6(address);
  if (!bytes) return null;
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return quad(bytes[2], bytes[3], bytes[4], bytes[5]);
  }
  const nat64 =
    bytes[0] === 0x00 &&
    bytes[1] === 0x64 &&
    bytes[2] === 0xff &&
    bytes[3] === 0x9b;
  if (!nat64) return null;
  const wkp = bytes.slice(4, 12).every((b) => b === 0);
  if (wkp) return quad(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (bytes[4] === 0x00 && bytes[5] === 0x01) {
    if (bytes[8] !== 0) return "malformed";
    return quad(bytes[6], bytes[7], bytes[9], bytes[10]);
  }
  return null;
}

function quad(a: number, b: number, c: number, d: number): string {
  return [a, b, c, d].join(".");
}

function parseIpv6(address: string): Uint8Array | null {
  let ip = address
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const zone = ip.indexOf("%");
  if (zone >= 0) ip = ip.slice(0, zone);
  if (!ip.includes(":")) return null;

  const lastColon = ip.lastIndexOf(":");
  const dotted = ip.slice(lastColon + 1);
  if (dotted.includes(".")) {
    const nums = dotted.split(".").map((part) => Number(part));
    if (
      nums.length !== 4 ||
      nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
    ) {
      return null;
    }
    const hex = nums.map((n) => n.toString(16).padStart(2, "0")).join("");
    ip = `${ip.slice(0, lastColon + 1)}${hex.slice(0, 4)}:${hex.slice(4)}`;
  }

  if (ip.split("::").length > 2) return null;
  const halves = ip.split("::");
  const side = (value: string) => (value ? value.split(":") : []);
  const head = side(halves[0]);
  const tail = halves.length === 2 ? side(halves[1]) : [];
  if (![...head, ...tail].every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
    return null;
  }
  let groups: string[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const value = parseInt(groups[i], 16);
    bytes[i * 2] = value >> 8;
    bytes[i * 2 + 1] = value & 255;
  }
  return bytes;
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
export function classifyHostname(
  hostname: string,
): "blocked" | "public" | "not-ip" {
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

export async function resolvePublicAddresses(
  hostname: string,
): Promise<string[]> {
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
  if (
    addresses.length === 0 ||
    addresses.some((address) => isBlockedIp(address))
  ) {
    throw new UrlNotAllowedError();
  }
  return addresses;
}
