// Re-export from canonical supabase module
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase";

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
  const store = await cookies();

  if (!isSupabaseConfigured()) {
    const user = readDemoUser(store.get("mh_demo_user")?.value);
    return { data: { user }, error: null };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      data: { user: null },
      error: new Error("Supabase auth unavailable"),
    };
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll() {
        // Route handlers that only need getUser() do not have to refresh cookies here.
      },
    },
  });
  return supabase.auth.getUser();
}
