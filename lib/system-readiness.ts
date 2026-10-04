import { isSupabaseConfigured } from "@/lib/supabase";
import { scrapeSecret } from "@/lib/auth/scrape-gate";

export type ReadinessStatus = "ready" | "missing" | "partial";

export interface ReadinessItem {
  id: string;
  label: string;
  status: ReadinessStatus;
  blockerType: "none" | "env" | "provider_dashboard" | "verification";
  detail: string;
  nextStep: string;
  envKeys: string[];
  envStatus: Array<{ key: string; present: boolean }>;
  unlocks: string;
  userImpact: string;
  verifyPath: string;
  actionLabel: string;
  setupUrl?: string;
  setupSteps?: string[];
  diagnostics?: Array<{ label: string; value: string; help?: string }>;
  verifyEvidence?: string;
}

export interface SystemReadinessResult {
  ready: boolean;
  items: ReadinessItem[];
  missingEnv: string[];
  summary: {
    readyCount: number;
    total: number;
    envBlockers: number;
    providerDashboardBlockers: number;
    verificationBlockers: number;
    nextAction: string;
  };
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

function missingKeys(keys: string[]) {
  return keys.filter((key) => !hasValue(process.env[key]));
}

function envStatus(keys: string[]) {
  return keys.map((key) => ({ key, present: hasValue(process.env[key]) }));
}

export function systemReadiness(): SystemReadinessResult {
  const supabase = isSupabaseConfigured();
  const serviceRoleSecret = hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const serviceRole = supabase && serviceRoleSecret;
  const scrapeControl = Boolean(scrapeSecret());
  const anthropicNarrate = hasValue(process.env.ANTHROPIC_API_KEY);
  const aiProvider =
    anthropicNarrate ||
    hasValue(process.env.OPENAI_API_KEY) ||
    hasValue(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  const appUrl =
    hasValue(process.env.NEXT_PUBLIC_APP_URL) ||
    hasValue(process.env.VERCEL_URL);
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
    ? process.env.NEXT_PUBLIC_APP_URL.trim().replace(/\/$/, "")
    : process.env.VERCEL_URL?.trim()
      ? `https://${process.env.VERCEL_URL.trim().replace(/\/$/, "")}`
      : "http://localhost:3000";
  const appCallbackUrl = `${publicAppUrl}/auth/callback`;
  const supabaseProjectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    ? process.env.NEXT_PUBLIC_SUPABASE_URL.trim().replace(/\/$/, "")
    : "https://<project-ref>.supabase.co";
  const supabaseAuthCallbackUrl = `${supabaseProjectUrl}/auth/v1/callback`;
  const googleProviderVerified = hasValue(process.env.GOOGLE_OAUTH_VERIFIED);
  const googleProviderHint = hasValue(
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET,
  );
  const googleStatus =
    supabase && appUrl && googleProviderVerified
      ? "ready"
      : supabase && appUrl
        ? "partial"
        : "missing";

  const items: ReadinessItem[] = [
    {
      id: "supabase",
      label: "Supabase data API",
      status: supabase ? "ready" : "missing",
      blockerType: supabase ? "none" : "env",
      detail: supabase
        ? "Public Supabase URL and anon key are configured."
        : "The app is running with placeholder Supabase values, so live vehicle rows cannot load.",
      nextStep: supabase
        ? "Verified. Live inventory reads can use the configured Supabase API."
        : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      envKeys: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
      envStatus: envStatus([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ]),
      unlocks:
        "Saved inventory, real Scan rows, Discover rails, watchlists, source health, and user preferences.",
      userImpact: supabase
        ? "Users can load live inventory, save searches, keep watchlists, and carry preferences across devices."
        : "Users only see public preview rows; saved inventory, cross-device watchlists, and account preferences cannot persist.",
      verifyPath: "/api/system/status",
      actionLabel: "Connect database",
      setupUrl: "https://supabase.com/dashboard/project/_/settings/api",
      setupSteps: [
        "Open Supabase project settings and copy the Project URL.",
        "Copy the anon/public API key into NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        "Restart the app and verify /api/system/status reports Supabase ready.",
      ],
      verifyEvidence:
        "Status shows Supabase data API = ready and active deals can load from /api/scan.",
    },
    {
      id: "service-role",
      label: "Server write access",
      status: serviceRole ? "ready" : serviceRoleSecret ? "partial" : "missing",
      blockerType: serviceRole
        ? "none"
        : serviceRoleSecret
          ? "verification"
          : "env",
      detail: serviceRole
        ? "Server-side jobs can write enriched rows and scrape metadata."
        : serviceRoleSecret
          ? "A service role key exists, but the public Supabase project is still not connected, so writes cannot be verified end to end."
          : "Scrapers and admin backfills need a service role key to write real inventory.",
      nextStep: serviceRoleSecret
        ? serviceRole
          ? "Verified. Server jobs can write scraper results and source health."
          : "Connect NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to the same project, then verify writes."
        : "Set SUPABASE_SERVICE_ROLE_KEY only on the server.",
      envKeys: ["SUPABASE_SERVICE_ROLE_KEY"],
      envStatus: envStatus(["SUPABASE_SERVICE_ROLE_KEY"]),
      unlocks:
        "Source-search writes, scraper run logs, enrichment backfills, and source health updates.",
      userImpact: serviceRole
        ? "Scoped source searches can write fresh rows, run logs, source health, and enrichment evidence into the database."
        : serviceRoleSecret
          ? "Server write credentials exist, but writes cannot be trusted until the public Supabase project is connected to the same backend."
          : "Scrapers may read public pages, but matching rows, run logs, photo caching, and enrichment cannot be written safely.",
      verifyPath: "/api/scrape/health",
      actionLabel: "Enable server writes",
      setupUrl: "https://supabase.com/dashboard/project/_/settings/api",
      setupSteps: [
        "Copy the service_role key into SUPABASE_SERVICE_ROLE_KEY on the server only.",
        "Keep this key out of NEXT_PUBLIC_* variables and browser code.",
        "Run a scoped source search from Scan and confirm scraper_runs and deals are written.",
      ],
      verifyEvidence:
        "Status shows Server write access = ready and recent scraper runs appear with deals_found.",
    },
    {
      id: "google-login",
      label: "Google login",
      status: googleStatus,
      blockerType:
        googleStatus === "ready"
          ? "verification"
          : supabase && appUrl
            ? "provider_dashboard"
            : "env",
      detail:
        googleStatus === "ready"
          ? "The app callback route is wired and a successful Google OAuth redirect flow has been verified."
          : supabase && appUrl
            ? googleProviderHint
              ? "App-side OAuth wiring is present and local Google provider credentials appear to exist, but the hosted Supabase provider flow still needs verification."
              : "App-side OAuth wiring is present; Supabase Auth must have the Google provider and redirect URL enabled."
            : "Google sign-in cannot work until Supabase and the public app URL are configured.",
      nextStep:
        googleStatus === "ready"
          ? "Verified. Keep the Supabase Auth callback URL registered in Google Cloud and retest after domain changes."
          : "Enable Google provider in Supabase Auth, add Google client ID/secret, and allow /auth/callback as a redirect URL.",
      envKeys: ["NEXT_PUBLIC_APP_URL", "GOOGLE_OAUTH_VERIFIED"],
      envStatus: envStatus([
        "NEXT_PUBLIC_APP_URL",
        "GOOGLE_OAUTH_VERIFIED",
        "SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET",
      ]),
      unlocks:
        "Real Google sign-in, persistent profiles, saved searches, and personalized buying scope.",
      userImpact:
        googleStatus === "ready"
          ? "Users can start the Google sign-in flow and keep profiles, searches, watchlists, and buying scope tied to their account."
          : "Visitors can browse preview data, but cannot create a real Google-backed account or sync watchlists across devices.",
      verifyPath: "/login",
      actionLabel: "Configure Google OAuth",
      setupUrl: "https://supabase.com/dashboard/project/_/auth/providers",
      setupSteps: [
        `In Google Cloud OAuth, add Authorized redirect URI: ${supabaseAuthCallbackUrl}.`,
        "In Supabase Auth > Providers > Google, enable Google and paste the client ID/secret.",
        `In Supabase Auth URL configuration, allow site URL ${publicAppUrl} and redirect URL ${appCallbackUrl}.`,
        "Hosted Supabase stores the Google client ID/secret in the Supabase dashboard, not in the browser app environment.",
        "Open /login and click Continue with Google to verify the full redirect/callback flow. Set GOOGLE_OAUTH_VERIFIED=true only after a successful verification.",
      ],
      diagnostics: [
        {
          label: "Google Cloud authorized redirect URI",
          value: supabaseAuthCallbackUrl,
          help: "Paste this into the Google OAuth client redirect URI list.",
        },
        {
          label: "Supabase Site URL",
          value: publicAppUrl,
          help: "Set this in Supabase Auth URL Configuration.",
        },
        {
          label: "Supabase additional redirect URL",
          value: appCallbackUrl,
          help: "Allow this app callback so PKCE can finish the login session.",
        },
      ],
      verifyEvidence:
        "Google redirects back to /auth/callback, creates a Supabase session, and lands on /discover.",
    },
    {
      id: "scrape-control",
      label: "Scraper control",
      status:
        scrapeControl && supabase
          ? "ready"
          : scrapeControl
            ? "partial"
            : "missing",
      blockerType:
        scrapeControl && supabase
          ? "none"
          : scrapeControl
            ? "verification"
            : "env",
      detail:
        scrapeControl && supabase
          ? "Protected scraper endpoints can be called with the shared secret or admin session."
          : scrapeControl
            ? "Scraper endpoints have a shared secret, but imports cannot complete until Supabase is connected."
            : "Production scraper control is disabled without SCRAPE_SECRET or CRON_SECRET.",
      nextStep: scrapeControl
        ? scrapeControl && supabase
          ? "Verified. Search selected sources from Scan for scoped results."
          : "Connect Supabase, then run a scoped source search from Scan."
        : "Set SCRAPE_SECRET or CRON_SECRET, then run scoped source searches from Scan.",
      envKeys: ["SCRAPE_SECRET", "CRON_SECRET"],
      envStatus: envStatus(["SCRAPE_SECRET", "CRON_SECRET"]),
      unlocks:
        "Protected source search button, scheduled imports, and lane-scoped source execution.",
      userImpact:
        scrapeControl && supabase
          ? "Users can run scoped source searches from their selected lane, state, source type, and watched dealers without flooding the database."
          : scrapeControl
            ? "Users can reach protected scraper endpoints, but normal imports still need the live database connection to persist results."
            : "Users can preview and plan sources, but source searches stay disabled until authorized scraper control exists.",
      verifyPath: "/scan",
      actionLabel: "Enable scoped searches",
      setupSteps: [
        "Set SCRAPE_SECRET or CRON_SECRET in the server environment.",
        "Use the normal UI Search selected sources button from Discover, Onboarding, or Scan.",
        "Confirm the run is limited to the selected lane/state/source and writes source proof.",
      ],
      verifyEvidence:
        "A scoped /api/scrape/run returns successful sources and Scan shows fresh matching rows.",
    },
    {
      id: "ai-provider",
      label: "AI provider",
      status: aiProvider ? "ready" : "missing",
      blockerType: aiProvider ? "none" : "env",
      detail: aiProvider
        ? anthropicNarrate
          ? "Anthropic Haiku is set for narrate-only briefs. Prices still come from fetched data, not the model."
          : "An OpenAI or Gemini key is set as a narrate fallback. Prefer ANTHROPIC_API_KEY (Haiku). Prices still come from fetched data."
        : "Deterministic deal briefs and market pulse are available now. Narration prefers ANTHROPIC_API_KEY (Haiku); OpenAI and Gemini are optional fallbacks.",
      nextStep: aiProvider
        ? "Verified. Narration can use the configured provider. Do not use the model to invent prices."
        : "Set ANTHROPIC_API_KEY for Haiku narrate-only briefs. OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY are optional fallbacks.",
      envKeys: [
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
      ],
      envStatus: envStatus([
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GOOGLE_GENERATIVE_AI_API_KEY",
      ]),
      unlocks:
        "Narrate-only deal briefs and market analyst wording on top of fetched deal data. Not price invention.",
      userImpact: aiProvider
        ? "Deal briefs and analyst routes can add natural-language reasoning on top of the deterministic buyer math. Shown prices stay fetched, not model-invented."
        : "Users still get deterministic buy/pass math, deal briefs, and market pulse from real data; provider AI is the upgrade for richer generated explanations.",
      verifyPath: "/api/market/analyst",
      actionLabel: "Connect AI",
      setupUrl: "https://console.anthropic.com/settings/keys",
      setupSteps: [
        "Create an Anthropic API key and set ANTHROPIC_API_KEY. Optional ANTHROPIC_MODEL defaults to Haiku; Opus is refused.",
        "OPENAI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY are optional fallbacks only.",
        "Restart the app so server routes can read the key.",
        "Verify briefs narrate fetched deals. Do not enable ENABLE_LLM_PRICE_INVENT.",
      ],
      verifyEvidence:
        "Deal briefs and market analyst routes include provider-generated explanations without leaking the key.",
    },
  ];

  const missingEnv = Array.from(
    new Set(
      items
        .filter((item) => item.status !== "ready")
        .flatMap((item) => missingKeys(item.envKeys)),
    ),
  );
  const pending = items.filter((item) => item.status !== "ready");
  const next = pending[0];

  return {
    ready: pending.length === 0,
    items,
    missingEnv,
    summary: {
      readyCount: items.length - pending.length,
      total: items.length,
      envBlockers: pending.filter((item) => item.blockerType === "env").length,
      providerDashboardBlockers: pending.filter(
        (item) => item.blockerType === "provider_dashboard",
      ).length,
      verificationBlockers: pending.filter(
        (item) => item.blockerType === "verification",
      ).length,
      nextAction:
        next?.nextStep ||
        "All launch gates are ready. Keep monitoring source freshness and importer runs.",
    },
  };
}
