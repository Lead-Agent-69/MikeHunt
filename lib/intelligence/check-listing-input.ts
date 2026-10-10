import type { CheckListingInput } from "./check-listing";
import { zipToState } from "@/lib/geo/zip-state";
import { US_STATES } from "@/lib/geo/us-states";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Two-letter US state (incl. DC) or null. */
export function usState(v: unknown): string | null {
  const s = String(v ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(s) && US_STATES[s] ? s : null;
}

/** A 5-digit ZIP that maps to a US state, else null. */
export function usZip(v: unknown): { zip: string; state: string } | null {
  const z = String(v ?? "").trim();
  if (!/^\d{5}$/.test(z)) return null;
  const state = zipToState(z);
  return state ? { zip: z, state } : null;
}

const present = (v: unknown) => v != null && String(v).trim() !== "";

/**
 * Validate a location given as a ZIP, a state, or both. Bad values and a ZIP in another state
 * are errors (never silently dropped, never defaulted).
 */
export function parseLocation(
  zipRaw: unknown,
  stateRaw: unknown,
  what: string,
): { error: string } | { zip: string | null; state: string | null } {
  const zip = present(zipRaw) ? usZip(zipRaw) : null;
  if (present(zipRaw) && !zip)
    return { error: `That ${what} ZIP isn't a valid US ZIP code.` };
  const state = present(stateRaw) ? usState(stateRaw) : null;
  if (present(stateRaw) && !state)
    return { error: `That ${what} state isn't a valid two-letter US state.` };
  if (zip && state && zip.state !== state)
    return {
      error: `The ${what} ZIP ${zip.zip} is in ${zip.state}, not ${state}.`,
    };
  return { zip: zip?.zip ?? null, state: state ?? zip?.state ?? null };
}

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
      /** A tracked deal to read from our DB instead of scraping. */
      dealId: string | null;
      /** Buyer-home override (the saved home is resolved server-side). */
      homeState: string | null;
      homeZip: string | null;
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
    const miles =
      q.match(/\b([\d,.]+)\s*(k)?\s*(?:mi|miles)\b/i) ||
      q.match(/\b(\d{2,3})k\b(?!\s*\$)/i);
    if (miles)
      fromText.mileage = Math.round(
        Number(miles[1].replace(/,/g, "")) *
          (miles[2] || /k$/i.test(miles[0]) ? 1000 : 1),
      );
    const zip = q.match(/\b(\d{5})\b(?![\d,])/);
    if (zip && zip[1] !== String(fromText.year)) fromText.zip = zip[1];
    if (/\bsalvage\b/i.test(q)) fromText.title = "salvage";
    else if (/\brebuilt\b/i.test(q)) fromText.title = "rebuilt";
    if (year) {
      const after = q
        .slice((year.index || 0) + 4)
        .replace(
          /\$[\d,.]+k?|\b[\d,.]+\s*k?\s*(mi|miles)\b|\b\d{5}\b|\b\d{2,3}k\b|salvage|rebuilt|clean/gi,
          " ",
        )
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
    ...(num(b.year, 1950, 2100) != null
      ? { year: num(b.year, 1950, 2100) }
      : {}),
    ...(str(b.make) ? { make: str(b.make) } : {}),
    ...(str(b.model) ? { model: str(b.model) } : {}),
    ...(str(b.trim) ? { trim: str(b.trim) } : {}),
    ...(num(b.mileage, 1, 2_000_000) != null
      ? { mileage: num(b.mileage, 1, 2_000_000) }
      : {}),
    ...(num(b.price, 1, 10_000_000) != null
      ? { price: num(b.price, 1, 10_000_000) }
      : {}),
    ...(title && /^(clean|salvage|rebuilt|rebuildable)$/.test(title)
      ? { title }
      : {}),
    ...(typeof b.vin === "string" && /^[A-HJ-NPR-Z0-9]{17}$/i.test(b.vin.trim())
      ? { vin: b.vin.trim().toUpperCase() }
      : {}),
  };
  // Where the car is: ZIP and/or state, validated (a typed-in ZIP from `q` counts too).
  // A ZIP guessed from free text is only kept when it is a real US ZIP; a typed `zip` field is
  // validated strictly.
  const textZip =
    !present(b.zip) && fields.zip && usZip(fields.zip) ? fields.zip : null;
  const loc = parseLocation(present(b.zip) ? b.zip : textZip, b.state, "car's");
  if ("error" in loc) return loc;
  delete fields.zip;
  if (loc.zip) fields.zip = loc.zip;
  if (loc.state) fields.state = loc.state;
  // Buyer-home override: ZIP and/or state, validated the same way.
  const home = parseLocation(b.homeZip, b.homeState, "home");
  if ("error" in home) return home;

  let dealId: string | null = null;
  if (present(b.dealId)) {
    if (typeof b.dealId !== "string" || !UUID_RE.test(b.dealId.trim()))
      return { error: "That deal id isn't valid." };
    dealId = b.dealId.trim().toLowerCase();
  }
  if (!url && !dealId && !fields.make && !fields.vin)
    return {
      error: "Paste a listing link, a VIN, or the year, make and model.",
    };
  return {
    url: url ?? null,
    dealId,
    homeState: home.state,
    homeZip: home.zip,
    fields,
  };
}
