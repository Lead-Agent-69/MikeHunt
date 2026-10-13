export function vehicleLocation(city?: string | null, state?: string | null) {
  const region = state?.trim().toUpperCase() || "";
  const place = city?.trim() || "";
  if (!region) return place || "Location not reported";
  if (place.toUpperCase() === region) return region;
  if (
    place.toUpperCase().endsWith(`,${region}`) ||
    place.toUpperCase().endsWith(`, ${region}`)
  ) {
    return `${place.slice(0, place.lastIndexOf(",")).trim()}, ${region}`;
  }
  return [place, region].filter(Boolean).join(", ");
}
