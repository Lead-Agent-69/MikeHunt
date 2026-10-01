import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

// Build-time safety: `next build` evaluates route modules (page-data collection) AND prerenders pages
// (static generation) WITHOUT the runtime env present. A missing-env THROW here — or a createClient("") —
// fails the whole build, which silently froze every Vercel deploy. Instead fall back to a harmless
// placeholder client so nothing crashes at build; at REQUEST time in prod the real env is present and used.
const PLACEHOLDER_URL = "https://placeholder.supabase.co";
const PLACEHOLDER_KEY = "placeholder";

let warnedInvalidUrl = false;

function isTemplateValue(value: string | undefined): boolean {
  if (!value) return true;
  const v = value.trim().toLowerCase();
  return (
    !v ||
    v.includes("your-project") ||
    v.includes("your_project") ||
    v.includes("your-supabase") ||
    v.includes("replace-with") ||
    v === PLACEHOLDER_KEY ||
    v === PLACEHOLDER_URL
  );
}

function resolvedUrl(): string {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (isTemplateValue(u)) return PLACEHOLDER_URL;
  const url = u as string;

  // Previous guard was a case-sensitive `!u.includes("YOUR_PROJECT_ID")`, which let `.env.local`'s
  // lowercase `your_supabase_project_url` through. createBrowserClient then THREW "Invalid
  // supabaseUrl: Must be a valid HTTP or HTTPS URL" while prerendering /login and /lane, killing
  // the entire `next build` — exactly the deploy-freezing failure this placeholder exists to
  // prevent. Validate properly instead of pattern-matching one known template.
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return url;
  } catch {
    // not a parseable absolute URL
  }

  if (!warnedInvalidUrl) {
    warnedInvalidUrl = true;
    console.error(
      `[supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid http(s) URL (value length ${url.length}); falling back to the placeholder client so the build can proceed.`,
    );
  }
  return PLACEHOLDER_URL;
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
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return !isTemplateValue(url) && !isTemplateValue(anonKey);
}
