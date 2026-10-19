type WorkerEnv = {
  SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
};

/** Server workers must prefer their private target over a browser/dev default. */
export function resolveWorkerSupabaseUrl(env: WorkerEnv): string {
  return env.SUPABASE_URL?.trim() || env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
}

/**
 * Scraper modules historically read NEXT_PUBLIC_SUPABASE_URL directly. Normalize it once at
 * worker startup so dynamically imported modules all use the same hosted target.
 */
export function applyWorkerSupabaseUrl(env?: WorkerEnv): string {
  const target = env || {
    SUPABASE_URL: process.env.SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  };
  const url = resolveWorkerSupabaseUrl(target);
  if (url) {
    if (env) env.NEXT_PUBLIC_SUPABASE_URL = url;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  }
  return url;
}
