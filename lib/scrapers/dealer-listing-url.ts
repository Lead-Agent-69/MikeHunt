/** A dealer listing must be a navigable vehicle URL, not an inventory or account page. */
export function dealerListingUrl(
  href: string | null | undefined,
  baseUrl: string,
  inventoryUrl: string,
): string | null {
  if (
    !href?.trim() ||
    /^(?:#|javascript:|mailto:|tel:|data:)/i.test(href.trim())
  )
    return null;
  try {
    const url = new URL(href, baseUrl);
    const base = new URL(baseUrl);
    const inventory = new URL(inventoryUrl, baseUrl);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const identifiesVehicle = Array.from(url.searchParams.entries()).some(
      ([key, value]) =>
        /^(?:id|vid|vehicle_?id|listing_?id|stock(?:_?(?:id|number|no))?|vin)$/i.test(
          key,
        ) &&
        value.trim().length > 0 &&
        value !== inventory.searchParams.get(key),
    );
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      path === "/" ||
      (path === (inventory.pathname.replace(/\/+$/, "") || "/") &&
        !identifiesVehicle) ||
      (/^\/(?:inventory|vehicles|cars|used|used-cars|search)\/?$/i.test(path) &&
        !identifiesVehicle) ||
      /(?:saved.?vehicles|wishlist|favorites|my.?garage|compare|login|deposit)(?:\/|$)/i.test(
        path,
      )
    )
      return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}
