import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// Build-time safety: `next build` evaluates route modules (page-data collection) AND prerenders pages
// (static generation) WITHOUT the runtime env present. A missing-env THROW here — or a createClient("") —
// fails the whole build, which silently froze every Vercel deploy. Instead fall back to a harmless
// placeholder client so nothing crashes at build; at REQUEST time in prod the real env is present and used.
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "placeholder";

function resolvedUrl(): string {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return u && !u.includes("YOUR_PROJECT_ID") ? u : PLACEHOLDER_URL;
}

export function getSupabaseClient(): SupabaseClient {
  const isNode = typeof process !== "undefined" && process.versions?.node;
  const ws = isNode ? eval("require")("ws") : undefined;
  return createClient(
    resolvedUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
    ws ? { realtime: { transport: ws } } : undefined,
  );
}

export function createClientComponentClient(): SupabaseClient {
  return createBrowserClient(
    resolvedUrl(),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || PLACEHOLDER_KEY,
  );
}

export function createServerComponentClient(): SupabaseClient {
  const isNode = typeof process !== "undefined" && process.versions?.node;
  const ws = isNode ? eval("require")("ws") : undefined;
  return createClient(
    resolvedUrl(),
    process.env.SUPABASE_SERVICE_ROLE_KEY || PLACEHOLDER_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      ...(ws ? { realtime: { transport: ws } } : {}),
    },
  );
}

// Legacy named export — call this instead of using `supabase` directly.
export function getSupabase(): SupabaseClient {
  return getSupabaseClient();
}

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return Boolean(url && !url.includes("YOUR_PROJECT_ID"));
}
