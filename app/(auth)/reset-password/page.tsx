"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { Field } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { friendlyAuthError } from "@/lib/auth/friendly-error";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    let active = true;
    async function checkSession() {
      try {
        if (
          !isSupabaseConfigured() ||
          new URLSearchParams(window.location.search).has("error")
        ) {
          throw new Error(
            "This reset link is invalid or expired. Request a new link below.",
          );
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
    };
  }, []);

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
      <section className="w-full max-w-md">
        <h1 className="text-2xl font-bold text-[var(--t1)] mb-4">
          Set a new password
        </h1>
        {checking && <p role="status">Checking your reset link...</p>}
        {error && (
          <p role="alert" className="mb-4 text-sm text-[var(--red)]">
            {error}
          </p>
        )}
        {complete ? (
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
            <Field
              label="New password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <p className="text-sm text-[var(--t3)]">At least 12 characters</p>
            <Field
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
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
