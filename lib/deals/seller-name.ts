// lib/deals/seller-name.ts
//
// A seller NAME is the only seller identity a listing card may carry, and only to a flip desk.
// Scrapers sometimes store a private seller's phone number, email or profile link in the seller
// field itself, and /api/scan used to fall back from name → phone → email when building `seller`,
// so a guest could read a private seller's contact details off a Scan card (Ren P1). This module is
// the backstop: anything that looks like contact details is never a seller name.

import { isContactKey } from "@/lib/deals/deal-desk-access";

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// Any "@" at all (handles, obfuscated or partial emails) is not a name.
const AT_RE = /@|\[\s*at\s*\]|\(\s*at\s*\)/i;
// Seven or more digits in a phone-shaped run: 555-123-4567, (555) 123 4567, +1 555.123.4567.
const PHONE_RE = /\+?\d[\d\s().-]{5,}\d/;
const URL_RE = /\b(?:https?:\/\/|www\.)|\/\//i;

function digitCount(value: string): number {
  return (value.match(/\d/g) || []).length;
}

/** True when a string carries a phone number, email address or link. */
export function looksLikeContact(value: string): boolean {
  if (EMAIL_RE.test(value) || AT_RE.test(value) || URL_RE.test(value))
    return true;
  const phone = value.match(PHONE_RE);
  return Boolean(phone && digitCount(phone[0]) >= 7);
}

/**
 * Seller display name, or undefined. Accepts a string or a raw seller object ({ name, ... });
 * contact keys inside an object are never read, and a value that looks like a phone, email or
 * link is dropped rather than shown.
 */
export function safeSellerName(value: unknown): string | undefined {
  let raw: unknown = value;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const record = raw as Record<string, unknown>;
    raw = record.name ?? record.displayName ?? record.display_name;
  }
  if (typeof raw !== "string") return undefined;
  const name = raw.replace(/\s+/g, " ").trim();
  if (!name || looksLikeContact(name)) return undefined;
  return name.slice(0, 120);
}

/**
 * Seller identity for a listing card on this desk. Flip desks keep a scrubbed seller name; every
 * other desk, including signed-out guests, gets no seller name at all. Never mutates the input.
 */
export function sellerForDesk<T extends Record<string, any>>(
  card: T,
  flipDesk: boolean,
): T {
  const out: Record<string, any> = { ...card };
  delete out.sellerName;
  delete out.seller_name;
  if (flipDesk) {
    const name = safeSellerName(card.seller);
    if (name) out.seller = name;
    else delete out.seller;
  } else {
    delete out.seller;
    // Backstop: no contact-shaped key (sellerPhone, seller_whatsapp, contact, ...) survives.
    for (const key of Object.keys(out)) if (isContactKey(key)) delete out[key];
  }
  return out as T;
}
