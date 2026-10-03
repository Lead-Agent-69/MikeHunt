import type {
  ReadinessItem,
  SystemReadinessResult,
} from "@/lib/system-readiness";

export interface AuthProviderReadiness {
  reachable: boolean;
  google: boolean | null;
  email: boolean | null;
  checkedAt: string;
  source: "supabase-auth-settings";
  error?: "not_configured" | "unreachable" | "invalid_response";
}

function unavailable(
  error: AuthProviderReadiness["error"],
): AuthProviderReadiness {
  return {
    reachable: false,
    google: null,
    email: null,
    checkedAt: new Date().toISOString(),
    source: "supabase-auth-settings",
    error,
  };
}

export function unconfiguredAuthProviders(): AuthProviderReadiness {
  return unavailable("not_configured");
}

export async function readAuthProviderReadiness(
  fetchImpl: typeof fetch = fetch,
): Promise<AuthProviderReadiness> {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(
    /\/$/,
    "",
  );
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!projectUrl || !anonKey) return unconfiguredAuthProviders();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4_000);
  try {
    const response = await fetchImpl(`${projectUrl}/auth/v1/settings`, {
      cache: "no-store",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return unavailable("unreachable");

    const settings = await response.json();
    if (!settings?.external || typeof settings.external !== "object") {
      return unavailable("invalid_response");
    }

    return {
      reachable: true,
      google: settings.external.google === true,
      email: settings.external.email === true,
      checkedAt: new Date().toISOString(),
      source: "supabase-auth-settings",
    };
  } catch {
    return unavailable("unreachable");
  } finally {
    clearTimeout(timeout);
  }
}

function summarize(items: ReadinessItem[]) {
  const pending = items.filter((item) => item.status !== "ready");
  return {
    ready: pending.length === 0,
    missingEnv: Array.from(
      new Set(
        pending.flatMap((item) =>
          item.envStatus
            .filter((entry) => !entry.present)
            .map((entry) => entry.key),
        ),
      ),
    ),
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
        pending[0]?.nextStep ||
        "All launch gates are ready. Keep monitoring source freshness and importer runs.",
    },
  };
}

export function applyAuthProviderReadiness(
  readiness: SystemReadinessResult,
  providers: AuthProviderReadiness,
): SystemReadinessResult {
  if (!providers.reachable || providers.google == null) return readiness;

  const items = readiness.items.map((item) => {
    if (item.id !== "google-login") return item;
    const googleEnabled = providers.google === true;
    return {
      ...item,
      status: googleEnabled ? "ready" : "partial",
      blockerType: googleEnabled ? "none" : "provider_dashboard",
      detail: googleEnabled
        ? "Supabase Auth reports Google enabled and the app callback route is wired for PKCE sign-in."
        : "Supabase Auth is reachable, but its Google provider is disabled.",
      nextStep: googleEnabled
        ? "Google sign-in is available. Retest the redirect after any domain or OAuth-client change."
        : "Enable Google in Supabase Auth, add the Google client ID and secret, then retest /login.",
      envKeys: ["NEXT_PUBLIC_APP_URL"],
      envStatus: item.envStatus.filter(
        (entry) => entry.key === "NEXT_PUBLIC_APP_URL",
      ),
      userImpact: googleEnabled
        ? "Users can start Google sign-in and keep profiles, searches, watchlists, and buying scope tied to their account."
        : "Email sign-in remains available, but Google-backed accounts cannot be created until the provider is enabled.",
      actionLabel: googleEnabled
        ? "Test Google login"
        : "Configure Google OAuth",
      verifyEvidence: googleEnabled
        ? "Live Supabase Auth settings report Google enabled; the browser redirect should reach Google's account chooser and return through /auth/callback."
        : "Live Supabase Auth settings report Google disabled.",
    } satisfies ReadinessItem;
  });

  return { items, ...summarize(items) };
}
