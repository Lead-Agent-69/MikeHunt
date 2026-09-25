export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/auth/admin";

// GET /api/auth/whoami — current user + whether they're THE admin. Server-checked (cookie session);
// the client uses it only to decide whether to render the admin nav. Real enforcement is middleware.
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return NextResponse.json({
      email: user?.email ?? null,
      isAdmin: isAdminEmail(user?.email),
    });
  } catch {
    return NextResponse.json({ email: null, isAdmin: false });
  }
}
