import { isSupabaseConfigured } from "@/lib/supabase";
import { scrapeSecret } from "@/lib/auth/scrape-gate";

export type ReadinessStatus = "ready" | "missing" | "partial";

export interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  nextStep: string;
  envKeys: string[];
  unlocks: string;
  setupUrl?: string;
}

function hasValue(value: string | undefined) {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  if (!v) return false;
  return ![
    "replace-with",
    "placeholder",
    "your-project",
    "your_project",
    "your-supabase",
    "changeme",
    "change-me",
  ].some((needle) => v.includes(needle));
}

export function systemReadiness(): {
  ready: boolean;
  items: ReadinessItem[];
  missingEnv: string[];
} {
  const supabase = isSupabaseConfigured();
  const serviceRole = hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const scrapeControl = Boolean(scrapeSecret());
  const aiProvider =
    hasValue(process.env.OPENAI_API_KEY) ||
    hasValue(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const appUrl =
    hasValue(process.env.NEXT_PUBLIC_APP_URL) ||
    hasValue(process.env.VERCEL_URL);

  const items: ReadinessItem[] = [
    {
      id: "supabase",
      label: "Supabase data API",
      status: supabase ? "ready" : "missing",
      detail: supabase
        ? "Public Supabase URL and anon key are configured."
        : "The app is running with placeholder Supabase values, so live vehicle rows cannot load.",
      nextStep:
        "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      envKeys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      unlocks:
        "Saved inventory, real Scan rows, Discover rails, watchlists, source health, and user preferences.",
      setupUrl: "https://supabase.com/dashboard/project/_/settings/api",
    },
    {
      id: "service-role",
      label: "Server write access",
      status: serviceRole ? "ready" : "missing",
      detail: serviceRole
        ? "Server-side jobs can write enriched rows and scrape metadata."
        : "Scrapers and admin backfills need a service role key to write real inventory.",
      nextStep: "Set SUPABASE_SERVICE_ROLE_KEY only on the server.",
      envKeys: ["SUPABASE_SERVICE_ROLE_KEY"],
      unlocks:
        "Importer writes, scraper run logs, enrichment backfills, and source health updates.",
      setupUrl: "https://supabase.com/dashboard/project/_/settings/api",
    },
    {
      id: "google-login",
      label: "Google login",
      status: supabase && appUrl ? "partial" : "missing",
      detail:
        supabase && appUrl
          ? "App-side OAuth wiring is present; Supabase Auth must have the Google provider and redirect URL enabled."
          : "Google sign-in cannot work until Supabase and the public app URL are configured.",
      nextStep:
        "Enable Google provider in Supabase Auth and allow /auth/callback as a redirect URL.",
      envKeys: [
        "NEXT_PUBLIC_APP_URL",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
      ],
      unlocks:
        "Real Google sign-in, persistent profiles, saved searches, and personalized buying scope.",
      setupUrl: "https://supabase.com/dashboard/project/_/auth/providers",
    },
    {
      id: "scrape-control",
      label: "Scraper control",
      status: scrapeControl ? "ready" : "missing",
      detail: scrapeControl
        ? "Protected scraper endpoints can be called with the shared secret or admin session."
        : "Production scraper control is disabled without SCRAPE_SECRET or CRON_SECRET.",
      nextStep:
        "Set SCRAPE_SECRET or CRON_SECRET, then run scoped imports from Scan.",
      envKeys: ["SCRAPE_SECRET", "CRON_SECRET"],
      unlocks:
        "Protected run/import button, scheduled imports, and lane-scoped source execution.",
    },
    {
      id: "ai-provider",
      label: "AI provider",
      status: aiProvider ? "ready" : "missing",
      detail: aiProvider
        ? "AI brief and analyst routes have a provider key available."
        : "AI explanations and deal briefs will stay limited without a provider key.",
      nextStep: "Set OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY.",
      envKeys: ["OPENAI_API_KEY", "GOOGLE_GENERATIVE_AI_API_KEY"],
      unlocks:
        "AI deal briefs, buy/pass explanations, market analyst routes, and richer trust summaries.",
    },
  ];

  return {
    ready: items.every((item) => item.status === "ready"),
    items,
    missingEnv: Array.from(
      new Set(
        items
          .filter((item) => item.status !== "ready")
          .flatMap((item) => item.envKeys),
      ),
    ),
  };
}
