"use client";

import { useState } from "react";
import Link from "next/link";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { Field } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { Ico } from "@/components/shared/Ico";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";
import { friendlyAuthError } from "@/lib/auth/friendly-error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);
    setError(null);

    if (!isSupabaseConfigured()) {
      setMessage(
        "Local demo mode is active. Use any email and password to sign in.",
      );
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        },
      );
      if (error) throw error;
      setMessage(
        "If an account exists for this email, a password reset link has been sent.",
      );
    } catch (error) {
      setError(
        friendlyAuthError(
          error instanceof Error
            ? error
            : (error as { message?: string })?.message,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 pb-6 pt-24 sm:p-6 bg-[var(--s1)] pb-safe animate-fadeUp">
      <div className="absolute top-0 left-0 right-0 z-10 p-6">
        <Link
          href="/"
          aria-label="MIKEHUNT home"
          className="inline-flex items-center gap-2.5"
        >
          <MikeHuntLogo size="md" />
        </Link>
      </div>

      <div className="w-full max-w-md glass-panel p-8 sm:p-10">
        <div className="text-center mb-6">
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: "var(--grad)" }}
          >
            <Ico name="mail" size={26} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--t1)] mb-2">
            Reset password
          </h1>
          <p className="text-sm text-[var(--t3)]">
            Enter your email and we will send a reset link if the account
            exists.
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-4 rounded-xl text-sm font-medium border text-[var(--red)]"
          >
            {error}
          </div>
        )}
        {message && (
          <div
            role="status"
            className="mb-4 p-4 rounded-xl text-sm font-medium border text-[var(--green)]"
          >
            {message}
          </div>
        )}

        <form onSubmit={handleReset} className="flex flex-col gap-4">
          <Field
            label="Email address"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@dealership.com"
          />
          <Btn type="submit" loading={loading} className="w-full py-3">
            {loading ? "Sending..." : "Send reset link"}
          </Btn>
        </form>

        <div className="text-center mt-6">
          <Link
            href="/login"
            className="text-sm font-semibold text-[var(--amber-d)] hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
