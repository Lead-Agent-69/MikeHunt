import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// OAuth (PKCE) callback — Supabase redirects here after Google sign-in with a `code`. We exchange it for
// a session (writing the auth cookies) and forward to `next` (the deal feed by default). Public
// route: the user isn't authenticated until the exchange completes.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") || "/discover";
  // Only allow relative in-app redirects (no open redirect to arbitrary hosts).
  const next = nextParam.startsWith("/") ? nextParam : "/discover";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(
            cookiesToSet: { name: string; value: string; options: any }[],
          ) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Behind Vercel the public host is in x-forwarded-host; use it so the redirect stays on-origin.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      const base = isLocal
        ? origin
        : forwardedHost
          ? `https://${forwardedHost}`
          : origin;
      return NextResponse.redirect(`${base}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
