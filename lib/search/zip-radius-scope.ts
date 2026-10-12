export const DEFAULT_RADIUS_MI = 100;
export const MAX_RADIUS_MI = 500;

/** Shared query contract for inventory and outbound search scope. */
export function parseZipRadius(
  params: URLSearchParams,
): { zip: string; radius: number } | null {
  const zip = (params.get("zip") || "").trim();
  if (!/^\d{5}$/.test(zip)) return null;
  const r = Number(params.get("radius"));
  const radius =
    Number.isFinite(r) && r > 0
      ? Math.min(MAX_RADIUS_MI, Math.max(5, Math.round(r)))
      : DEFAULT_RADIUS_MI;
  return { zip, radius };
}
