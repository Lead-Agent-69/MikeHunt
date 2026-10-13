type PickupIdentityRow = {
  make?: string | null;
  model?: string | null;
  title?: string | null;
  trim?: string | null;
};

/** Extract only an explicitly reported series; trim names and prices are not substitutes. */
export function pickupSeriesIdentity(row: PickupIdentityRow) {
  const make = (row.make || "").toLowerCase().replace(/[^a-z]/g, "");
  const model = (row.model || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const family =
    ["chevrolet", "chevy"].includes(make) && /^silverado(?:\d|hd|$)/.test(model)
      ? "Silverado"
      : make === "gmc" && /^sierra(?:\d|hd|$)/.test(model)
        ? "Sierra"
        : null;
  if (!family) return null;
  const pattern = new RegExp(`\\b${family}[\\s-]*(1500|2500|3500)(?!\\d)`, "i");
  const hints = [
    row.model?.match(pattern)?.[1],
    row.title?.match(pattern)?.[1],
    row.trim?.match(/^\s*(1500|2500|3500)(?:[\s-]*HD)?\s*$/i)?.[1],
  ].filter((value): value is string => Boolean(value));
  const series = Array.from(new Set(hints));
  return {
    family,
    series: series.length === 1 ? series[0] : null,
    conflicting: series.length > 1,
  };
}
