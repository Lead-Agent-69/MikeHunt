import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";

function clearDemoCookie(response: NextResponse) {
  response.cookies.set("mh_demo_user", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function POST() {
  if (isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  return clearDemoCookie(NextResponse.json({ ok: true }));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") || "/login";
  const response = new NextResponse(null, {
    status: 303,
    headers: { Location: next.startsWith("/") ? next : "/login" },
  });
  if (isSupabaseConfigured()) return response;
  return clearDemoCookie(response);
}
