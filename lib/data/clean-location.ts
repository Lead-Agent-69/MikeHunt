// Scrapers (esp. dealer listings) dump marketing copy, dealer names, and street addresses into the
// city field — "** Fast Approvals! **", "City Motor Miami LLC", "5104 East Olympic Blvd.". That junk
// pollutes the map, geocoding, and city filters. cleanCity returns a real-looking city or null.
// Pure, no I/O. Conservative: it only rejects clear junk, so legit multi-word cities pass
// ("San Antonio", "Fort Worth", "St. Louis", "Las Vegas").

// Dealer/marketing/finance tokens that never appear in a real city name (word-bounded so "Lincoln"
// isn't caught by "inc", etc.).
const JUNK_WORDS =
  /\b(approv\w*|habla|espanol|español|blowout|financ\w*|warranty|guarantee\w*|wholesale|llc|inc|corp|motors?|dealers?|auto|autos|sales|dealership|credit|special|certified|inventory|showroom|clearance|outlet|sellers?|private|marketplace|listing|autotrader|craigslist)\b/i;

export function cleanCity(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Strip decorative wrappers (*, +, quotes, leading/trailing punctuation/space).
  const city = String(raw)
    .replace(/[*+~|"']/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (city.length < 2 || city.length > 30) return null; // too short / too long for a city
  if (/[\d!$@#%^=<>]/.test(city)) return null; // digits → street address; symbols → ad copy
  if (city.split(" ").length > 4) return null; // real city names are ≤4 words
  if (JUNK_WORDS.test(city)) return null; // dealer/marketing copy
  if (!/[a-zA-Z]/.test(city)) return null; // must contain letters

  return city;
}
