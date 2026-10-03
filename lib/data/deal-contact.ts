// lib/data/deal-contact.ts
//
// Seller contact lives in `deals.options.contact` (jsonb). There are NO `seller_phone` /
// `seller_email` COLUMNS on `deals` — writing them used to reject every insert with a PGRST
// schema error, and reading `row.seller_phone` silently yields `undefined`.
//
// Several feed routes were doing exactly that (`sellerPhone: d.seller_phone`), so the contact
// rail on DiscoveryCard was always empty. Read through this helper instead: it prefers the
// canonical `options.contact`, falls back to a top-level column if a view/projection happens
// to expose one, and always returns a normalized { phone, email, url } contact object.

import { sourceFromUrl, sourceMeta } from "@/lib/sources/source-meta";

export interface SellerContact {
  phone: string | null;
  email: string | null;
  url: string | null;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function directSellerLink(record: UnknownRecord): string | null {
  const url =
    asNonEmptyString(record.source_url) ??
    asNonEmptyString(record.sourceUrl) ??
    null;
  if (!url) return null;
  const source =
    sourceFromUrl(url) ??
    asNonEmptyString(record.source) ??
    asNonEmptyString(record.source_id);
  const channel = sourceMeta(source).channel;
  return channel === "dealer" ||
    channel === "retail" ||
    channel === "marketplace" ||
    channel === "private"
    ? url
    : null;
}

/**
 * Extract seller phone/email from a deals row (or flash_deals view row).
 *
 * Accepts the same loose `any` rows the feed routes already pass around; the input is widened
 * to `unknown` so callers can hand back Supabase results without casting.
 */
export function sellerContact(row: unknown): SellerContact {
  const record = asRecord(row);
  if (!record) return { phone: null, email: null, url: null };

  // 1. Canonical location: options.contact.{phone,email}
  const options = asRecord(record.options);
  const contact = options ? asRecord(options.contact) : null;

  // 2. Fallback: some projections/views may surface the fields at the top level.
  const phone =
    asNonEmptyString(contact?.phone) ?? asNonEmptyString(record.seller_phone);
  const email =
    asNonEmptyString(contact?.email) ?? asNonEmptyString(record.seller_email);
  const url =
    asNonEmptyString(contact?.url) ??
    asNonEmptyString(record.seller_contact_url) ??
    asNonEmptyString(record.contact_url) ??
    directSellerLink(record);

  return { phone, email, url };
}

/** Convenience: just the phone, for routes that only render a call button. */
export function sellerPhone(row: unknown): string | null {
  return sellerContact(row).phone;
}

/** Convenience: just the email, for routes that only render a mailto link. */
export function sellerEmail(row: unknown): string | null {
  return sellerContact(row).email;
}

/**
 * Spread this into an API deal payload.
 *
 * Returns the `sellerPhone` / `sellerEmail` keys that `DiscoveryDeal`
 * (components/discovery/types.ts) and `DiscoveryCard` actually read — spreading
 * `sellerContact()` directly would emit `{ phone, email }` and silently drop the contact rail.
 *
 * Mirrors what app/api/discover/route.ts already does inline:
 *   sellerPhone: d.options?.contact?.phone
 */
export function sellerContactFields(row: unknown): {
  sellerPhone: string | null;
  sellerEmail: string | null;
  sellerContactUrl: string | null;
} {
  const { phone, email, url } = sellerContact(row);
  return { sellerPhone: phone, sellerEmail: email, sellerContactUrl: url };
}
