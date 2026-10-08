"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { PasswordField } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";
import { authErrorMessage } from "@/lib/auth/auth-error-message";

export default function ResetPasswordPage() {
  const [status, setStatus] = useState<
    "checking" | "ready" | "invalid" | "complete"
  >("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [supabase] = useState(createClientComponentClient);

  useEffect(() => {
    let cancelled = false;
    async function checkRecovery() {
      try {
        if (
          !isSupabaseConfigured() ||
          new URLSearchParams(window.location.search).has("error") ||
          new URLSearchParams(window.location.hash.slice(1)).has("error")
        ) {
          if (!cancelled) setStatus("invalid");
          return;
        }
        const {
          data: { user },
          error: sessionError,
        } = await supabase.auth.getUser();
        if (!cancelled) setStatus(user && !sessionError ? "ready" : "invalid");
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    }
    void checkRecovery();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function handleUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (status !== "ready" || saving) return;
    setError(null);
    if (password.length < 12) {
      setError("Use at least 12 characters for your new password.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match. Please check both fields.");
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(
          authErrorMessage(
            updateError.message,
            "We couldn't update your password. Request a new reset link if this one has expired.",
          ),
        );
      } else {
        setPassword("");
        setConfirmation("");
        setStatus("complete");
      }
    } catch {
      setError("We couldn't connect. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 pb-6 pt-24 sm:p-6 bg-[var(--s1)]">
      <div className="absolute top-0 left-0 p-6">
        <Link href="/" aria-label="MIKEHUNT home">
          <MikeHuntLogo size="md" />
        </Link>
      </div>
      <section
        className="w-full max-w-md glass-panel p-6 sm:p-8"
        aria-labelledby="reset-title"
      >
        <h1
          id="reset-title"
          className="text-2xl font-bold text-[var(--t1)] mb-3"
        >
          {status === "complete" ? "Password updated" : "Choose a new password"}
        </h1>
        {status === "checking" && (
          <p role="status" className="text-[var(--t3)]">
            Checking your reset link...
          </p>
        )}
        {status === "invalid" && (
          <div role="alert" className="text-[var(--t3)]">
            <p>
              This reset link is missing, expired, or was opened in a different
              browser. Request a new link and open the latest email in the
              browser where you requested it.
            </p>
            <Link
              href="/forgot-password"
              className="mt-4 inline-block font-semibold text-[var(--amber)]"
            >
              Request a new reset link
            </Link>
          </div>
        )}
        {status === "complete" && (
          <div role="status">
            <p className="text-[var(--t3)]">Your new password is saved.</p>
            <Link
              href="/discover"
              className="mt-4 inline-block font-semibold text-[var(--amber)]"
            >
              Continue to MIKEHUNT
            </Link>
          </div>
        )}
        {status === "ready" && (
          <form onSubmit={handleUpdate} className="flex flex-col gap-4">
            <p className="text-sm text-[var(--t3)]">
              Use a unique password with at least 12 characters.
            </p>
            {error && (
              <p role="alert" className="text-sm text-[var(--red)]">
                {error}
              </p>
            )}
            <PasswordField
              label="New password"
              name="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={saving}
            />
            <PasswordField
              label="Confirm new password"
              name="confirmation"
              autoComplete="new-password"
              minLength={12}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={saving}
            />
            <Btn type="submit" loading={saving} className="w-full">
              {saving ? "Updating..." : "Update password"}
            </Btn>
          </form>
        )}
        <Link
          href="/login"
          className="mt-6 inline-block text-sm text-[var(--t3)] hover:underline"
        >
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
