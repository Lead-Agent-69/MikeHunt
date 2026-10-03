"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

// "Continue with Google" — kicks off Supabase OAuth (PKCE). On success the browser is redirected to
// Google, then back to /auth/callback?next=…, which exchanges the code and lands on the deal feed.
export function GoogleButton({
  next = "/discover",
  label = "Continue with Google",
  setupHref = "/status",
  previewHref = "/scan?sort=score",
}: {
  next?: string;
  label?: string;
  setupHref?: string;
  previewHref?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState<boolean | null>(null);
  const supabase = createClientComponentClient();
  const configured = isSupabaseConfigured();
  const canUseGoogle = configured && googleReady !== false;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/system/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (
          data?.authProviders?.reachable === true &&
          typeof data.authProviders.google === "boolean"
        ) {
          setGoogleReady(data.authProviders.google);
          return;
        }
        const item = data?.readiness?.items?.find(
          (row: any) => row.id === "google-login",
        );
        if (!item) {
          setGoogleReady(null);
          return;
        }
        setGoogleReady(item.status === "ready");
      })
      .catch(() => {
        if (!cancelled) setGoogleReady(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = async () => {
    if (!configured) {
      setError(
        "Google sign-in is not available in this local preview. Continue with email instead.",
      );
      return;
    }
    if (googleReady === false) {
      setError(
        "Google sign-in is still being verified. Continue with email for now.",
      );
      return;
    }
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    });
    // On success the page navigates to Google, so we only get here on failure.
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={loading || !canUseGoogle}
        className="w-full inline-flex items-center justify-center gap-3 h-11 rounded-[var(--r2)] bg-white text-[#1f1f1f] font-semibold text-sm border border-black/10 shadow-sm hover:bg-[#f8f9fa] hover:shadow-md active:scale-[0.99] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <GoogleG />
        {loading
          ? "Connecting…"
          : googleReady === false
            ? "Google sign-in being verified"
            : canUseGoogle
              ? label
              : "Google sign-in not configured"}
      </button>
      {error && (
        <p className="text-xs text-center text-[var(--red)]">{error}</p>
      )}
      {(!configured || googleReady === false) && (
        <div className="rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2 text-left">
          <p className="text-xs font-bold text-[var(--t2)]">
            {configured
              ? "Google sign-in is almost ready"
              : "Account sync is in preview mode"}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--t3)]">
            {configured
              ? "Email sign-in still works. The team is finishing Google account verification for synced searches and watchlists."
              : "Local preview still works with email below."}
          </p>
          <Link
            href={setupHref}
            className="mt-1 inline-flex text-xs font-black text-[var(--amber-d)] hover:underline"
          >
            View system status
          </Link>
          <span className="mx-2 text-xs text-[var(--t5)]">·</span>
          <Link
            href={previewHref}
            className="mt-1 inline-flex text-xs font-black text-[var(--amber-d)] hover:underline"
          >
            Preview live Scan
          </Link>
        </div>
      )}
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

// A labeled "or" divider to sit between the Google button and the email form.
export function OrDivider({ label = "or" }: { label?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-[var(--b1)]" />
      <span className="text-[11px] uppercase tracking-wider text-[var(--t4)] font-semibold">
        {label}
      </span>
      <span className="h-px flex-1 bg-[var(--b1)]" />
    </div>
  );
}
