// Segment-aware route matching for middleware. A bare startsWith("/deal") also matches
// "/dealer-network" and "/deal-check", which turned the public dealer network into a login wall.
// A route matches itself and anything nested under it, never a sibling that shares a prefix.

export function matchesRoute(pathname: string, route: string): boolean {
  if (route === "/") return pathname === "/";
  const base = route.endsWith("/") ? route.slice(0, -1) : route;
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function matchesAnyRoute(
  pathname: string,
  routes: readonly string[],
): boolean {
  return routes.some((route) => matchesRoute(pathname, route));
}
