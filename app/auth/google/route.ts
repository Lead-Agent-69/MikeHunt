import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { isSupabaseConfigured } from "@/lib/supabase";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

function publicOrigin(request: NextRequest) {
  const requestOrigin = new URL(request.url).origin;
  if (process.env.NODE_ENV === "development") return requestOrigin;

  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  if (!forwardedHost || !/^[a-z0-9.-]+(?::\d+)?$/i.test(forwardedHost)) {
    return requestOrigin;
  }
  const protocol = forwardedProto === "http" ? "http" : "https";
  return `${protocol}://${forwardedHost}`;
}

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const origin = publicOrigin(request);
  const loginError = () =>
    NextResponse.redirect(`${origin}/login?error=oauth_start`, 303);

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(
      `${origin}/login?error=supabase_not_configured`,
      303,
    );
  }

  const pendingCookies: CookieToSet[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          pendingCookies.push(...cookiesToSet);
        },
      },
    },
  );

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
        skipBrowserRedirect: true,
      },
    });
    if (error || !data.url) return loginError();

    const response = NextResponse.redirect(data.url, 303);
    pendingCookies.forEach(({ name, value, options }) =>
      response.cookies.set(name, value, options),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return loginError();
  }
}
