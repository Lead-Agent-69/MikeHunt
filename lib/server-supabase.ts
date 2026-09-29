// Re-export from canonical supabase module
import { createServerComponentClient } from "@/lib/supabase";

export async function getServerUser() {
  const supabase = createServerComponentClient();
  return supabase.auth.getUser();
}

