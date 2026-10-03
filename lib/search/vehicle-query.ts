type VehicleSearchRow = {
  title?: unknown;
  year?: unknown;
  make?: unknown;
  model?: unknown;
  trim?: unknown;
  bodyClass?: unknown;
  condition?: unknown;
  damageType?: unknown;
  locationCity?: unknown;
  locationState?: unknown;
};

export function vehicleQueryTokens(query: string) {
  const normalized = query.toLowerCase().trim();
  const words = normalized.split(/\s+/).filter(Boolean);
  const aliases: Record<string, string[]> = {
    suvs: ["suv", "sport utility", "utility"],
    suv: ["suv", "sport utility", "utility"],
    trucks: ["truck", "pickup"],
    truck: ["truck", "pickup"],
    vans: ["van", "cargo"],
    van: ["van", "cargo"],
    sedans: ["sedan", "4dr", "four door"],
    sedan: ["sedan", "4dr", "four door"],
  };

  return Array.from(
    new Set(
      [...(aliases[normalized] || []), ...words, normalized].filter(Boolean),
    ),
  );
}

export function matchesVehicleQuery(row: VehicleSearchRow, query: string) {
  if (!query.trim()) return true;
  const haystack = [
    row.title,
    row.year,
    row.make,
    row.model,
    row.trim,
    row.bodyClass,
    row.condition,
    row.damageType,
    row.locationCity,
    row.locationState,
  ]
    .filter((value) => value != null)
    .join(" ")
    .toLowerCase();

  return vehicleQueryTokens(query).some((token) => haystack.includes(token));
}
