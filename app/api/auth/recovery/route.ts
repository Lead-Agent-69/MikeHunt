import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";
import { isRecoveryToken } from "@/lib/auth/recovery-token";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const reply = (body: object, status: number) =>
    NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  // Only an explicit same-origin action may consume a recovery token.
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return reply(
      { error: "Open this recovery link in DealerHunt and try again." },
      403,
    );
  }
  const limit = rateLimit(request, {
    key: "recovery-confirm",
    limit: 10,
    windowMs: 600_000,
  });
  if (!limit.allowed) {
    const response = reply(
      { error: "Please wait before trying this link again." },
      429,
    );
    response.headers.set("Retry-After", String(limit.retryAfter));
    return response;
  }
  if (!isSupabaseConfigured())
    return reply(
      { error: "Recovery is temporarily unavailable. Please try again." },
      503,
    );
  let tokenHash: unknown;
  try {
    const text = await request.text();
    if (text.length > 2048)
      return reply({ error: "This recovery link is invalid." }, 400);
    tokenHash = JSON.parse(text).token_hash;
  } catch {
    return reply({ error: "This recovery link is invalid." }, 400);
  }
  if (!isRecoveryToken(tokenHash))
    return reply(
      {
        error: "This recovery link is invalid or expired. Request a new link.",
      },
      400,
    );
  const response = reply({ verified: true }, 200);
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          items: { name: string; value: string; options: CookieOptions }[],
        ) =>
          items.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          ),
      },
    },
  );
  try {
    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    if (error || !data.user || !data.session) {
      // Never return staged session cookies after failed verification.
      return reply(
        {
          error:
            "This recovery link is invalid or expired. Request a new link.",
        },
        400,
      );
    }
    return response;
  } catch {
    return reply(
      {
        error:
          "We couldn't verify this link. Check your connection and try again.",
      },
      503,
    );
  }
}
