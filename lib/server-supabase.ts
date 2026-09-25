import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

async function serverClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    },
  );
}

export async function getServerUser() {
  const supabase = await serverClient();
  return supabase.auth.getUser();
}
