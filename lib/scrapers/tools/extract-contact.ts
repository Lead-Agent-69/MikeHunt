export interface ContactInfo {
  phone?: string;
  email?: string;
  vin?: string;
}

/**
 * Smartly extracts phone numbers, emails, and hidden VINs from free-text descriptions.
 * This ensures even raw, messy scraped data yields clickable contact buttons.
 */
export function extractContactInfo(text?: string): ContactInfo {
  if (!text) return {};

  const info: ContactInfo = {};

  // Extract Phone Number
  const phoneRegex =
    /(?:(?:\+?1\s*(?:[.-]\s*)?)?(?:\(\s*([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9])\s*\)|([2-9]1[02-9]|[2-9][02-8]1|[2-9][02-8][02-9]))\s*(?:[.-]\s*)?)?([2-9]1[02-9]|[2-9][02-9]1|[2-9][02-9]{2})\s*(?:[.-]\s*)?([0-9]{4})(?:\s*(?:#|x\.?|ext\.?|extension)\s*(\d+))?/gi;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch && phoneMatch.length > 0) {
    info.phone = phoneMatch[0].replace(/[^\d+]/g, "");
    if (info.phone.length > 15) {
      info.phone = info.phone.substring(0, 10);
    }
  }

  // Extract Email
  const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
  const emailMatch = text.match(emailRegex);
  if (emailMatch && emailMatch.length > 0) {
    info.email = emailMatch[0].toLowerCase();
  }

  // Extract hidden VIN (17 chars, no I, O, Q)
  const vinRegex = /\b([A-HJ-NPR-Z0-9]{17})\b/gi;
  const vinMatch = text.match(vinRegex);
  if (vinMatch && vinMatch.length > 0) {
    info.vin = vinMatch[0].toUpperCase();
  }

  return info;
}
