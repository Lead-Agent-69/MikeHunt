import { resolveZipRadius } from "./zip-radius";

export async function inventoryLocation(db: any, params: URLSearchParams) {
  const requested = Boolean(params.get("zip"));
  const radius = requested ? await resolveZipRadius(db, params) : null;
  const details = new URLSearchParams(params);
  if (radius) details.delete("zip");
  return { requested, radius, details };
}

export type InventoryLocation = Awaited<ReturnType<typeof inventoryLocation>>;

/** Radius is filtered in SQL before outer filters, sorting, counts and pagination. */
export function inventoryLocationQuery(
  db: any,
  location: InventoryLocation,
  columns: string,
  count = false,
) {
  if (location.requested && !location.radius)
    throw new Error("Search location unavailable");
  return location.radius
    ? db
        .rpc(
          "inventory_within_radius",
          {
            p_lat: location.radius.lat,
            p_lng: location.radius.lng,
            p_radius: location.radius.radius,
          },
          count ? { count: "exact" } : {},
        )
        .select(columns)
    : db.from("deals").select(columns, count ? { count: "exact" } : {});
}
