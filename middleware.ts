import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_ROUTES, isAdminEmail } from "@/lib/auth/admin";

// Protected routes that require authentication.
// Note: '/' is intentionally PUBLIC — the landing page handles its own
// auth check and redirects logged-in users to /find.
const protectedRoutes = [
  // Dashboard pages — all live behind auth; '/' (landing), '/login', '/register' stay public.
  "/today",
  // "/scan", — intentionally public: it's the landing page's "Launch App" target.
  "/discover",
  "/swipe",
  "/find",
  "/feed",
  "/market",
  "/best-buy",
  "/arbitrage",
  "/flash-deals",
  "/auctions",
  "/lane",
  "/map",
  "/bulk",
  "/saved",
  "/save",
  "/move",
  "/fleet",
  "/recon",
  "/finance",
  "/parts",
  "/list",
  "/insights",
  "/onboarding",
  "/status",
  "/compare",
  "/deal-check",
  "/developer",
  "/overview",
  "/changelog",
  "/upgrade",
  "/deal",
  "/searches",
  "/alerts",
  "/settings",
  // User-scoped APIs.
  "/api/inventory",
  "/api/alerts",
  "/api/watchlist",
  "/api/dealers",
  "/api/outcomes",
  "/api/calibration",
  "/api/saved-cars",
];

// Auth routes
const authRoutes = ["/login", "/register"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // Fail CLOSED in production: without credentials we cannot verify auth, and
    // silently letting everyone through protectedRoutes would expose the whole app.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "Supabase credentials missing in middleware — rejecting request (fail-closed).",
      );
      return NextResponse.json(
        { error: "Server misconfigured: auth unavailable" },
        { status: 500 },
      );
    }
    console.warn(
      "Supabase credentials missing in middleware. Skipping auth checks (dev only).",
    );
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Check if current route is protected ('/' is public — handled by the landing page)
  // Vercel Cron has no Supabase user session. These endpoints authenticate the
  // Authorization: Bearer CRON_SECRET header in their route handlers instead.
  const isCronEndpoint =
    pathname === "/api/alerts/process" ||
    pathname === "/api/alerts/profit-sniper";
  const isProtectedRoute =
    !isCronEndpoint &&
    protectedRoutes.some((route) => pathname.startsWith(route));
  // Check if current route is an auth route
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ADMIN GATE: dev/ops surfaces are for the single admin only. Anyone else (incl. logged-in
  // dealers) is bounced — they never reach the developer API, system status, or the orchestrator.
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));
  if (isAdminRoute && !isAdminEmail(user?.email)) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/discover" : "/login";
    return NextResponse.redirect(url);
  }

  // Logged-in users shouldn't see the auth pages — send them to the deal feed.
  if (isAuthRoute && user) {
    const url = request.nextUrl.clone();
    url.pathname = "/discover";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    // `monitoring` = the Sentry tunnel route (tunnelRoute in next.config) — must skip auth/redirects so
    // ad-blockers can't stop error reporting.
    "/((?!monitoring|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
