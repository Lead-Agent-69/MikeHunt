import { safeNextPath } from "@/lib/auth/safe-next-path";

/**
 * Build the /login redirect for a signed-out visitor, carrying where they were
 * headed as ?next=. Only a same-origin relative page path survives: API routes,
 * auth pages, and anything safeNextPath rejects are dropped. The original query
 * string moves into `next` instead of leaking onto /login.
 */
export function loginRedirectUrl(requestUrl: URL): URL {
  const url = new URL(requestUrl.toString());
  url.pathname = "/login";
  url.search = "";
  url.hash = "";
  const next = loginNextFor(requestUrl.pathname, requestUrl.search);
  if (next) url.searchParams.set("next", next);
  return url;
}

export function loginNextFor(pathname: string, search = ""): string | null {
  const next = safeNextPath(`${pathname}${search}`, "");
  if (!next) return null;
  const path = next.split(/[?#]/)[0];
  if (
    path === "/" ||
    path.startsWith("/api/") ||
    path === "/login" ||
    path === "/register"
  ) {
    return null;
  }
  return next;
}
