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
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== base.origin ||
      url.username ||
      url.password ||
      path === "/" ||
      path === (inventory.pathname.replace(/\/+$/, "") || "/") ||
      /^\/(?:inventory|vehicles|cars|used|used-cars|search)\/?$/i.test(path) ||
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
