// Re-export from canonical supabase module
import { cookies } from "next/headers";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

function readDemoUser(cookieValue: string | undefined) {
  if (!cookieValue) return null;
  try {
    const raw = Buffer.from(cookieValue, "base64url").toString("utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.id || !parsed?.email) return null;
    return {
      id: String(parsed.id),
      email: String(parsed.email),
      user_metadata: { name: parsed.name ?? parsed.email },
    };
  } catch {
    return null;
  }
}

export async function getServerUser() {
  if (!isSupabaseConfigured()) {
    const store = await cookies();
    const user = readDemoUser(store.get("mh_demo_user")?.value);
    return { data: { user }, error: null };
  }

  const supabase = createServerComponentClient();
  return supabase.auth.getUser();
}
