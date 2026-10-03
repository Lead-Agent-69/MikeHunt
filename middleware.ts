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

function isTemplateValue(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return (
    !v ||
    v.includes("your-project") ||
    v.includes("your_project") ||
    v.includes("your-supabase") ||
    v.includes("replace-with") ||
    v === "placeholder" ||
    v === "https://placeholder.supabase.co"
  );
}

function isSupabaseConfigured(): boolean {
  return (
    !isTemplateValue(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    !isTemplateValue(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const { pathname } = request.nextUrl;
  const isCronEndpoint =
    pathname === "/api/alerts/process" ||
    pathname === "/api/alerts/profit-sniper";
  const isProtectedRoute =
    !isCronEndpoint &&
    protectedRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  if (!isSupabaseConfigured()) {
    const demoUser = request.cookies.get("mh_demo_user")?.value;

    if (isProtectedRoute && !demoUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = demoUser ? "/discover" : "/login";
      return NextResponse.redirect(url);
    }

    if (isAuthRoute && demoUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/discover";
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Server misconfigured: auth unavailable" },
      { status: 500 },
    );
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

  // Check if current route is protected ('/' is public — handled by the landing page)
  // Vercel Cron has no Supabase user session. These endpoints authenticate the
  // Authorization: Bearer CRON_SECRET header in their route handlers instead.

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // ADMIN GATE: dev/ops surfaces are for the single admin only. Anyone else (incl. logged-in
  // dealers) is bounced — they never reach the developer API, system status, or the orchestrator.
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
