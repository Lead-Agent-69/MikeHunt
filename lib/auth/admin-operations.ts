import { isAdminEmail } from "@/lib/auth/admin";
import { getServerUser } from "@/lib/server-supabase";
import { isSupabaseConfigured } from "@/lib/supabase";

/**
 * Route-handler-only authorization for bounded owner maintenance tasks.
 * Keep this separate from `admin.ts`, which is also imported by Edge middleware.
 */
export async function canManageOperations(request: Request): Promise<boolean> {
  const secret = process.env.INGEST_SECRET;
  if (secret && request.headers.get("authorization") === `Bearer ${secret}`) {
    return true;
  }

  if (!isSupabaseConfigured()) return false;

  try {
    const {
      data: { user },
      error,
    } = await getServerUser();
    return !error && isAdminEmail(user?.email);
  } catch {
    return false;
  }
}
