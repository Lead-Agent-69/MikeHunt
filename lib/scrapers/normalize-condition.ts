// Coerce any scraper/AI-supplied condition string to the DB `listing_condition` enum. The AI rescue
// extractor and bespoke salvage sites emit free text ("Clean Title", "Salvage Title", "Non-Repairable",
// "Runs & Drives") that the enum rejects — which silently dropped every row. This is the single choke
// point: upsertDeals runs everything through it, so no source can inject an invalid enum again.
//
// Valid enum (supabase/migrations/20240101000001_initial_schema.sql):
//   run_drive, repairable, parts_only, clean_title, rebuilt_title, salvage_title, flood, fire, hail
const VALID = new Set([
  "run_drive",
  "repairable",
  "parts_only",
  "clean_title",
  "rebuilt_title",
  "salvage_title",
  "flood",
  "fire",
  "hail",
]);

export function normalizeCondition(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const x = String(raw)
    .toLowerCase()
    .trim()
    .replace(/[_\s-]+/g, " ");
  if (!x) return undefined;

  // Already a valid enum value (snake or spaced form).
  const snake = x.replace(/ /g, "_");
  if (VALID.has(snake)) return snake;

  // Title-brand / damage phrasings → enum. Order matters: most specific first.
  if (
    /\b(non[\s-]?repairable|parts only|parts car|cert(ificate)? of destruction|scrap|junk|crush|dismantle)\b/.test(
      x,
    )
  )
    return "parts_only";
  if (/\bflood|water\b/.test(x)) return "flood";
  if (/\bfire|burn/.test(x)) return "fire";
  if (/\bhail\b/.test(x)) return "hail";
  if (/prior[\s-]?salvage|reconstruct/.test(x)) return "rebuilt_title";
  if (/\b(rebuilt|prior salvage rebuilt)\b/.test(x)) return "rebuilt_title";
  if (/\b(repairable|rebuildable|fixable|damaged)\b/.test(x))
    return "repairable";
  if (/\bsalvage|total(ed)? loss|wreck/.test(x)) return "salvage_title";
  if (/\b(clean|clear)\b/.test(x)) return "clean_title";
  if (/\b(runs?( and | & |\/)drives?|run drive|drives|operable|starts)\b/.test(x))
    return "run_drive";

  // Unknown phrasing — return undefined (column is nullable) rather than break the insert.
  return undefined;
}
