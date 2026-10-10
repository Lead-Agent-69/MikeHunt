// mcp.vin is a third-party decoder used only as a fallback when NHTSA has no answer. Its body is
// untrusted: the year/make/model it reports become cache keys (nhtsa_recalls_cache) and upstream
// recall queries, so only validated, normalized fields survive and everything else is dropped.

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 .&'/+-]*$/;

function cleanName(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || s.length > max || !NAME_RE.test(s)) return null;
  return s;
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const s = v
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s && s.length <= max ? s : null;
}

function cleanYear(v: unknown, now = new Date()): number | null {
  const n =
    typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isInteger(n)) return null;
  return n >= 1981 && n <= now.getFullYear() + 2 ? n : null; // 17-char VINs start in 1981
}

export interface McpVinDecode {
  year: number;
  make: string;
  model: string;
  trim: string | null;
  engine: string | null;
  assembly_country: string | null;
}

/** Validated subset of an mcp.vin body, or null when year/make/model don't all pass. */
export function sanitizeMcpVin(
  raw: unknown,
  now = new Date(),
): McpVinDecode | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const year = cleanYear(r.year ?? r.Year ?? r.modelYear, now);
  const make = cleanName(r.make ?? r.Make, 40);
  const model = cleanName(r.model ?? r.Model, 60);
  if (!year || !make || !model) return null;
  return {
    year,
    make,
    model,
    trim: cleanName(r.trim ?? r.Trim, 60),
    engine: cleanText(r.engine ?? r.Engine, 80),
    assembly_country: cleanName(r.assembly_country ?? r.PlantCountry, 40),
  };
}
