type ListingDisplay = {
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  mileage?: number;
  location_city?: string;
  location_state?: string;
};

export function similarListingTitle(listing: ListingDisplay): string {
  const model = listing.model?.trim() || "";
  const trim = listing.trim?.trim() || "";
  const trimAlreadyIncluded =
    trim &&
    (model.toLowerCase() === trim.toLowerCase() ||
      model.toLowerCase().endsWith(` ${trim.toLowerCase()}`));
  return (
    [listing.year, listing.make, model, trimAlreadyIncluded ? "" : trim]
      .filter(Boolean)
      .join(" ") || "Vehicle listing"
  );
}

export function similarListingDetails(listing: ListingDisplay): string {
  const mileage =
    typeof listing.mileage === "number" &&
    Number.isFinite(listing.mileage) &&
    listing.mileage >= 0
      ? `${listing.mileage.toLocaleString("en-US")} mi`
      : "Mileage not reported";
  const location =
    [listing.location_city?.trim(), listing.location_state?.trim()]
      .filter(Boolean)
      .join(", ") || "Location not reported";
  return `${mileage} · ${location}`;
}
