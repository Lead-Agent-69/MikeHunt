import { NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  if (isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Demo auth is disabled" },
      { status: 404 },
    );
  }

  const { email, fullName } = await request.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const userId = `demo-${Buffer.from(email).toString("base64url").slice(0, 24)}`;
  const response = NextResponse.json({ success: true, userId, demo: true });
  response.cookies.set(
    "mh_demo_user",
    Buffer.from(
      JSON.stringify({ id: userId, email, name: fullName || email }),
    ).toString("base64url"),
    {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  );
  return response;
}
