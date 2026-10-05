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

// Pages that stay open to signed-out visitors but are still part of the
// buyer app. A signed-in buyer who has not finished setup is sent to
// onboarding from these too, so setup cannot be skipped through them.
const publicBuyerRoutes = ["/scan", "/dealer-network"];

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


function guestProfileOnboarded(request: NextRequest): boolean {
  const raw = request.cookies.get("mh_guest_profile")?.value;
  if (!raw) return false;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(
      atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)),
    );
    return json?.onboarded === true;
  } catch {
    return false;
  }
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
  const isSetupGatedRoute =
    isProtectedRoute ||
    publicBuyerRoutes.some((route) => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  const isAdminRoute = ADMIN_ROUTES.some((route) => pathname.startsWith(route));

  if (!isSupabaseConfigured()) {
    const demoUser = request.cookies.get("mh_demo_user")?.value;

    if (isProtectedRoute && !demoUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }

    if (
      demoUser &&
      isSetupGatedRoute &&
      !isAdminRoute &&
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/api/") &&
      !guestProfileOnboarded(request)
    ) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return NextResponse.redirect(url);
    }

    if (isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = demoUser ? "/discover" : "/login";
      return NextResponse.redirect(url);
    }

    if (isAuthRoute && demoUser) {
      const url = request.nextUrl.clone();
      url.pathname = guestProfileOnboarded(request)
        ? "/discover"
        : "/onboarding";
      url.search = "";
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
        cookiesToSet.forEach(({ name, value, options: _options }) =>
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

  const { data: claimsResult } = await supabase.auth.getClaims();
  const claims = claimsResult?.claims;
  const user = claims
    ? { email: typeof claims.email === "string" ? claims.email : null }
    : null;

  // getClaims() can refresh an expiring browser session. Preserve those cookies when a
  // route redirects, otherwise a successful sign-in can appear to disappear on the next page.
  const redirectWithAuthCookies = (url: URL) => {
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies
      .getAll()
      .forEach((cookie) => response.cookies.set(cookie));
    return response;
  };

  // Check if current route is protected ('/' is public — handled by the landing page)
  // Vercel Cron has no Supabase user session. These endpoints authenticate the
  // Authorization: Bearer CRON_SECRET header in their route handlers instead.

  if (isProtectedRoute && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return redirectWithAuthCookies(url);
  }

  // ADMIN GATE: dev/ops surfaces are for the single admin only. Anyone else (incl. logged-in
  // dealers) is bounced — they never reach the developer API, system status, or the orchestrator.
  if (isAdminRoute && !isAdminEmail(user?.email)) {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/discover" : "/login";
    return redirectWithAuthCookies(url);
  }

  const userId = typeof claims?.sub === "string" ? claims.sub : null;

  // Logged-in users leave the auth pages. An unfinished profile stays on
  // setup; a failed profile read must not lock the app.
  if (isAuthRoute && user) {
    let profileError = false;
    let onboarded = false;
    if (userId) {
      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("onboarded")
        .eq("id", userId)
        .maybeSingle();
      profileError = Boolean(error);
      onboarded = profile?.onboarded === true;
    }
    const url = request.nextUrl.clone();
    url.pathname = !profileError && !onboarded ? "/onboarding" : "/discover";
    url.search = "";
    return redirectWithAuthCookies(url);
  }

  if (
    user &&
    userId &&
    isSetupGatedRoute &&
    !isAdminRoute &&
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/api/")
  ) {
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("onboarded")
      .eq("id", userId)
      .maybeSingle();
    // A failed read must not lock the app. A missing or unfinished profile
    // goes through onboarding; there is no "set up later" bypass.
    if (!profileError && profile?.onboarded !== true) {
      const url = request.nextUrl.clone();
      url.pathname = "/onboarding";
      url.search = "";
      return redirectWithAuthCookies(url);
    }
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
