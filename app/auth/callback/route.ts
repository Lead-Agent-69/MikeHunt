import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { ensureAccountRows } from "@/lib/auth/account-bootstrap";
import {
  mergeGuestPrefsOnSignup,
  GUEST_PREFS_COOKIE,
} from "@/lib/preferences/merge-guest-prefs";
import { createServerComponentClient } from "@/lib/supabase";
import { safeNextPath } from "@/lib/auth/safe-next-path";

// OAuth (PKCE) callback — Supabase redirects here after Google sign-in with a `code`. We exchange it for
// a session (writing the auth cookies) and forward to `next` (the deal feed by default). Public
// route: the user isn't authenticated until the exchange completes.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Keep the callback inside the app, including against protocol-relative URLs.
  const next = safeNextPath(searchParams.get("next"));
  // Behind Vercel the public host is in x-forwarded-host; keep every callback
  // redirect on the same public origin so auth cookies are returned to the browser.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const isLocal = process.env.NODE_ENV === "development";
  const base = isLocal
    ? origin
    : forwardedHost
      ? `https://${forwardedHost}`
      : origin;

  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${base}/login?error=supabase_not_configured`);
  }

  if (code) {
    // Supabase may rotate several session cookies while exchanging the PKCE code.
    // They must be set on this redirect response; writing to a separate cookie store
    // and then creating a new redirect loses the authenticated session.
    const response = NextResponse.redirect(`${base}${next}`);
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(
            cookiesToSet: { name: string; value: string; options: any }[],
          ) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    try {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          // Recovery must not depend on buyer-profile provisioning or onboarding.
          if (next === "/reset-password") return response;
          try {
            const account = await ensureAccountRows(user);
            // Promote guest location cookie so scrape_demand sees the state they picked pre-signup.
            try {
              await mergeGuestPrefsOnSignup({
                supabase: createServerComponentClient(),
                userId: user.id,
                guestCookieRaw: request.cookies.get(GUEST_PREFS_COOKIE)?.value,
              });
            } catch (mergeErr) {
              console.warn("guest prefs merge skipped:", mergeErr);
            }
            // A user who has not chosen their buying preferences gets the same
            // onboarding path whether they joined by email or Google.
            if (!account.onboarded && next === "/discover") {
              response.headers.set("location", `${base}/onboarding`);
            }
          } catch (bootstrapError) {
            console.error("OAuth account bootstrap failed:", bootstrapError);
            response.headers.set(
              "location",
              `${base}/login?error=account_setup`,
            );
            return response;
          }
        }
        if (user) return response;
      }
    } catch {
      console.error("Authentication callback could not complete");
    }
  }

  return NextResponse.redirect(
    next === "/reset-password"
      ? `${base}/reset-password?error=invalid_link`
      : `${base}/login?error=oauth`,
  );
}
