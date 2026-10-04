import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";

export type PaidAiCaller =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Paid model calls require a signed-in user or a cron bearer.
 * /scan staying public in middleware is intentional; this gates the API.
 */
export async function requirePaidAiCaller(
  request: NextRequest,
): Promise<PaidAiCaller> {
  if (isAuthorizedCron(request)) return { ok: true, userId: "cron" };
  try {
    const { getServerUser } = await import("@/lib/server-supabase");
    const {
      data: { user },
    } = await getServerUser();
    if (user?.id) return { ok: true, userId: String(user.id) };
  } catch {
    // No session.
  }
  return {
    ok: false,
    response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  };
}
