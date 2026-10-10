import type { CheckListingInput } from "./check-listing";

const num = (v: unknown, min: number, max: number): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : undefined;
};
const str = (v: unknown, max = 60): string | undefined => {
  const s = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  return s && s.length <= max ? s : undefined;
};

export type ParsedCheckBody =
  | { error: string }
  | {
      url: string | null;
      homeState: string | null;
      fields: Partial<CheckListingInput>;
    };

/**
 * One input box: a listing URL, a VIN, or "2018 Honda Civic 71k $9,500 60432" style text are all
 * accepted in `q`; structured fields win over what `q` implies.
 */
export function parseCheckListingBody(raw: unknown): ParsedCheckBody {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { error: "Paste a listing link or enter the car's details." };
  const b = raw as Record<string, unknown>;
  const q = str(b.q, 2000) ?? "";
  const url = str(b.url, 2000) ?? (/^https?:\/\//i.test(q) ? q : undefined);
  if (url && !/^https?:\/\//i.test(url))
    return { error: "Paste a public http(s) listing link." };

  const fromText: Partial<CheckListingInput> = {};
  if (q && !url) {
    const vin = q.toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/);
    if (vin) fromText.vin = vin[0];
    const year = q.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
    if (year) fromText.year = Number(year[1]);
    const price = q.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k)?/i);
    if (price)
      fromText.price = Math.round(
        Number(price[1].replace(/,/g, "")) * (price[2] ? 1000 : 1),
      );
    const miles = q.match(/\b([\d,.]+)\s*(k)?\s*(?:mi|miles)\b/i) || q.match(/\b(\d{2,3})k\b(?!\s*\$)/i);
    if (miles)
      fromText.mileage = Math.round(
        Number(miles[1].replace(/,/g, "")) * (miles[2] || /k$/i.test(miles[0]) ? 1000 : 1),
      );
    const zip = q.match(/\b(\d{5})\b(?![\d,])/);
    if (zip && zip[1] !== String(fromText.year)) fromText.zip = zip[1];
    if (/\bsalvage\b/i.test(q)) fromText.title = "salvage";
    else if (/\brebuilt\b/i.test(q)) fromText.title = "rebuilt";
    if (year) {
      const after = q
        .slice((year.index || 0) + 4)
        .replace(/\$[\d,.]+k?|\b[\d,.]+\s*k?\s*(mi|miles)\b|\b\d{5}\b|\b\d{2,3}k\b|salvage|rebuilt|clean/gi, " ")
        .trim()
        .split(/\s+/)
        .filter((w) => /^[a-z][\w-]*$/i.test(w));
      if (after[0]) fromText.make = after[0];
      if (after[1]) fromText.model = after.slice(1, 3).join(" ");
    }
  }

  const title = str(b.title, 20)?.toLowerCase();
  const fields: Partial<CheckListingInput> = {
    ...fromText,
    ...(num(b.year, 1950, 2100) != null ? { year: num(b.year, 1950, 2100) } : {}),
    ...(str(b.make) ? { make: str(b.make) } : {}),
    ...(str(b.model) ? { model: str(b.model) } : {}),
    ...(str(b.trim) ? { trim: str(b.trim) } : {}),
    ...(num(b.mileage, 1, 2_000_000) != null ? { mileage: num(b.mileage, 1, 2_000_000) } : {}),
    ...(num(b.price, 1, 10_000_000) != null ? { price: num(b.price, 1, 10_000_000) } : {}),
    ...(/^\d{5}$/.test(String(b.zip ?? "").trim()) ? { zip: String(b.zip).trim() } : {}),
    ...(title && /^(clean|salvage|rebuilt|rebuildable)$/.test(title) ? { title } : {}),
    ...(typeof b.vin === "string" && /^[A-HJ-NPR-Z0-9]{17}$/i.test(b.vin.trim())
      ? { vin: b.vin.trim().toUpperCase() }
      : {}),
  };
  const homeState = /^[A-Za-z]{2}$/.test(String(b.homeState ?? ""))
    ? String(b.homeState).toUpperCase()
    : null;
  if (!url && !fields.make && !fields.vin)
    return { error: "Paste a listing link, a VIN, or the year, make and model." };
  return { url: url ?? null, homeState, fields };
}
