"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { PasswordField } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { friendlyAuthError } from "@/lib/auth/friendly-error";
import { isRecoveryToken } from "@/lib/auth/recovery-token";
import { createLatestRequest } from "@/lib/latest-request";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const recoveryRequests = useRef(createLatestRequest());
  const confirming = useRef(false);

  useEffect(() => {
    let active = true;
    const manager = recoveryRequests.current;
    async function checkSession() {
      try {
        if (
          !isSupabaseConfigured() ||
          new URLSearchParams(window.location.search).has("error") ||
          new URLSearchParams(window.location.hash.slice(1)).has("error")
        ) {
          throw new Error(
            "This reset link is invalid or expired. Request a new link below.",
          );
        }
        const token = new URLSearchParams(window.location.hash.slice(1)).get(
          "token_hash",
        );
        if (token !== null) {
          if (!isRecoveryToken(token))
            throw new Error(
              "This reset link is invalid or expired. Request a new link below.",
            );
          if (active) setRecoveryToken(token);
          // Page previews and existing sessions must not consume the email link.
          return;
        }
        const { data, error } =
          await createClientComponentClient().auth.getUser();
        if (error || !data.user)
          throw new Error(
            "This reset link is invalid or expired. Request a new link below.",
          );
        if (active) setReady(true);
      } catch (error) {
        if (active) setError(friendlyAuthError(error));
      } finally {
        if (active) setChecking(false);
      }
    }
    void checkSession();
    return () => {
      active = false;
      manager.cancel();
    };
  }, []);

  async function confirmRecovery() {
    if (confirming.current || !recoveryToken) return;
    confirming.current = true;
    const task = recoveryRequests.current.start();
    setVerifying(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/recovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_hash: recoveryToken }),
        signal: task.signal,
      });
      const result = await response.json();
      if (!task.isCurrent()) return;
      if (!response.ok || result?.verified !== true) {
        throw new Error(
          "This reset link could not be verified. Try again or request a new link.",
        );
      }
      // A full navigation removes the bearer hash and reloads the verified
      // cookies even when this browser was signed in to a different account.
      window.location.replace("/reset-password");
    } catch {
      if (task.isCurrent())
        setError(
          "We couldn't verify this link. Try again or request a new reset link.",
        );
    } finally {
      if (task.isCurrent()) {
        confirming.current = false;
        setVerifying(false);
        task.finish();
      }
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !ready || complete) return;
    setError(null);
    if (password.length < 12) {
      setError("Use at least 12 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setSaving(true);
    try {
      const supabase = createClientComponentClient();
      const { data: identity, error: sessionError } =
        await supabase.auth.getUser();
      if (sessionError || !identity.user) {
        setReady(false);
        throw new Error("Your session has expired. Request a new reset link.");
      }
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw new Error(error.message);
      if (!data.user || data.user.id !== identity.user.id)
        throw new Error(
          "The password update could not be confirmed. Please try again.",
        );
      setPassword("");
      setConfirmation("");
      setComplete(true);
    } catch (error) {
      setError(friendlyAuthError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--s1)] px-6 py-12">
      <section className="glass-panel w-full max-w-md rounded-2xl border border-[var(--b1)] bg-[var(--s0)] p-6 sm:p-8">
        <Link
          href="/"
          aria-label="DealerHunt home"
          className="mb-8 inline-flex min-h-11 items-center"
        >
          <MikeHuntLogo size="md" />
        </Link>
        <h1 className="text-2xl font-bold text-[var(--t1)] mb-4">
          Set a new password
        </h1>
        {checking && <p role="status">Checking your reset link...</p>}
        {error && (
          <p role="alert" className="mb-4 text-sm text-[var(--red)]">
            {error}
          </p>
        )}
        {recoveryToken ? (
          <div className="space-y-4">
            <p className="text-[var(--t3)]">
              Continue to verify your email link, then choose a new password.
              Your password has not changed.
            </p>
            <Btn type="button" loading={verifying} onClick={confirmRecovery}>
              {verifying ? "Verifying link..." : "Continue to reset password"}
            </Btn>
            <Link
              href="/forgot-password"
              className="block font-semibold text-[var(--amber-d)]"
            >
              Request a new reset link
            </Link>
          </div>
        ) : complete ? (
          <div>
            <p role="status" className="mb-4">
              Your password has been updated.
            </p>
            <Link
              href="/discover"
              className="text-[var(--amber-d)] font-semibold"
            >
              Continue to Discover
            </Link>
          </div>
        ) : ready ? (
          <form onSubmit={save} className="flex flex-col gap-4">
            <PasswordField
              label="New password"
              name="password"
              autoComplete="new-password"
              minLength={12}
              required
              disabled={saving}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-sm text-[var(--t3)]">At least 12 characters</p>
            <PasswordField
              label="Confirm new password"
              name="confirmation"
              autoComplete="new-password"
              minLength={12}
              required
              disabled={saving}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
            <Btn type="submit" loading={saving}>
              {saving ? "Updating..." : "Update password"}
            </Btn>
          </form>
        ) : (
          !checking && (
            <Link
              href="/forgot-password"
              className="text-[var(--amber-d)] font-semibold"
            >
              Request a new reset link
            </Link>
          )
        )}
        <Link href="/login" className="block mt-6 text-sm text-[var(--t3)]">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
