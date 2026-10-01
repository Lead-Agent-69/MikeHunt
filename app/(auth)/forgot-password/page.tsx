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

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
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

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/login`
        : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      setError(error.message);
    } else {
      setMessage("Check your email for a password reset link.");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--s1)] pb-safe animate-fadeUp">
      <div className="absolute top-0 left-0 right-0 p-6">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-lg"
            style={{ background: "var(--grad)" }}
            aria-hidden
          >
            <Ico name="search" size={20} />
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--t1)]">
            MikeHunt
          </span>
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
          <div className="mb-4 p-4 rounded-xl text-sm font-medium border text-[var(--red)]">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 p-4 rounded-xl text-sm font-medium border text-[var(--green)]">
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
