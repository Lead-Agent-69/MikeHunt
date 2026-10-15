export function nearbySearchDraft(raw: string) {
  const zip = raw.replace(/\D/g, "").slice(0, 5);
  return { zip, clearStateBoundary: /^\d{5}$/.test(zip) };
}

export const radiusRefreshMessage =
  "Nearby inventory search is available. Refreshing sources by distance is not supported yet; a source refresh needs a state-based search.";

export function hasRadiusCollectionScope(scope: unknown): boolean {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) return false;
  const values = scope as Record<string, unknown>;
  return ["zip", "radius", "radiusMiles", "postalCode"].some(
    (key) => values[key] != null && String(values[key]).trim() !== "",
  );
}
