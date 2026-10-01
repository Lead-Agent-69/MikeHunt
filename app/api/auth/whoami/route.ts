export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isAdminEmail } from "@/lib/auth/admin";
import { getServerUser } from "@/lib/server-supabase";
import { isSupabaseConfigured } from "@/lib/supabase";

// GET /api/auth/whoami — current user + whether they're THE admin. Server-checked (cookie session);
// the client uses it only to decide whether to render the admin nav. Real enforcement is middleware.
export async function GET() {
  try {
    const {
      data: { user },
    } = await getServerUser();
    return NextResponse.json({
      id: user?.id ?? null,
      email: user?.email ?? null,
      isAdmin: isAdminEmail(user?.email),
      demo: !isSupabaseConfigured() && Boolean(user),
    });
  } catch {
    return NextResponse.json({
      id: null,
      email: null,
      isAdmin: false,
      demo: false,
    });
  }
}
