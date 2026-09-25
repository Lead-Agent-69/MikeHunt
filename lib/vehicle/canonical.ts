// Canonicalize scraped/decoded make names. NHTSA returns uppercase ("FORD", "LAND ROVER"); scraped
// titles are inconsistent ("chevy", "MERCEDES"). This normalizes to clean display form so the make
// filter, cards, and dedupe are consistent. Pure, no I/O.

const SPECIAL: Record<string, string> = {
  BMW: "BMW",
  GMC: "GMC",
  MINI: "MINI",
  RAM: "Ram",
  VW: "Volkswagen",
  CHEVY: "Chevrolet",
  "MERCEDES-BENZ": "Mercedes-Benz",
  MERCEDES: "Mercedes-Benz",
  "LAND ROVER": "Land Rover",
  "ALFA ROMEO": "Alfa Romeo",
  "ROLLS-ROYCE": "Rolls-Royce",
  "ASTON MARTIN": "Aston Martin",
};

export function titleCaseMake(make: string | null | undefined): string {
  if (!make) return "";
  const u = make.trim().toUpperCase();
  if (SPECIAL[u]) return SPECIAL[u];
  return make
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/-(\w)/g, (_, c) => "-" + c.toUpperCase());
}

/** Light model cleanup — trim whitespace, collapse spaces, keep NHTSA casing. */
export function canonicalModel(model: string | null | undefined): string {
  return (model || "").trim().replace(/\s+/g, " ");
}
