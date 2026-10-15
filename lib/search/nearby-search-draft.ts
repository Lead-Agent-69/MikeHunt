export function nearbySearchDraft(raw: string) {
  const zip = raw.replace(/\D/g, "").slice(0, 5);
  return { zip, clearStateBoundary: /^\d{5}$/.test(zip) };
}

export const radiusRefreshMessage =
  "Nearby inventory search is available. Refreshing sources by distance is not supported yet; a source refresh needs a state-based search.";
