/**
 * Buyer contact for the cash-offer letter. Never invent a company, phone or email: prefill
 * only what the signed-in user's profile actually has, and leave the rest blank.
 */
export interface OfferBuyerContact {
  name: string;
  phone: string;
  email: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Pull contact fields from a GET /api/profile payload ({ profile, ... }). */
export function buyerContactFromProfile(payload: unknown): OfferBuyerContact {
  const p =
    payload && typeof payload === "object"
      ? ((payload as { profile?: Record<string, unknown> }).profile ?? {})
      : {};
  return {
    name: str(p.company_name) || str(p.business_name) || str(p.name),
    phone: str(p.phone),
    email: str(p.email),
  };
}

/** Text shown in the letter for a field the user has not filled in. */
export const OFFER_BLANK = {
  name: "[Your name or business]",
  phone: "[Your phone]",
  email: "[Your email]",
} as const;
