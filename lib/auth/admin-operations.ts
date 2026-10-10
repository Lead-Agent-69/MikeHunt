import { isAdminEmail } from "@/lib/auth/admin";
import { bearerMatches } from "@/lib/auth/bearer";
import { getServerUser } from "@/lib/server-supabase";

/**
 * Route-handler-only authorization for bounded owner maintenance tasks.
 * Keep this separate from `admin.ts`, which is also imported by Edge middleware.
 */
export async function canManageOperations(request: Request): Promise<boolean> {
  const secret = process.env.INGEST_SECRET;
  if (secret && bearerMatches(request.headers.get("authorization"), secret)) {
    return true;
  }

  try {
    const {
      data: { user },
    } = await getServerUser();
    return isAdminEmail(user?.email);
  } catch {
    return false;
  }
}
